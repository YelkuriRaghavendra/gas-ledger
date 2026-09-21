import { describe, it, expect } from 'vitest'
import { settleOldestFirst } from './profit'
import type { BillProfit, PaymentBill } from '../types/db'

function bill(id: number, day: string, revenueIncl: number, profit: number, paid = false): BillProfit {
  return {
    bill_id: id,
    bill_number: `B-${id}`,
    customer_id: 1,
    created_at: `${day}T10:00:00+05:30`,
    day,
    paid,
    qty: 1,
    revenue_incl: revenueIncl,
    revenue_ex: revenueIncl / 1.18,
    cost_ex: 0,
    profit,
    gst_out: revenueIncl - revenueIncl / 1.18,
    gst_in: 0,
    cost_known: true,
  }
}

function payment(day: string, amount: number): PaymentBill {
  return { customer_id: 1, created_at: `${day}T10:00:00+05:30`, total_amount: amount }
}

describe('settleOldestFirst', () => {
  it('treats a counter-paid sale as fully realised without consuming payments', () => {
    const [settled] = settleOldestFirst([bill(1, '2026-09-03', 29000, 3000, true)], [])
    expect(settled.realisedFraction).toBe(1)
    expect(settled.realisedProfit).toBe(3000)
    expect(settled.pendingProfit).toBe(0)
  })

  it('clears the oldest credit bill first', () => {
    const bills = [
      bill(3, '2026-09-18', 34800, 1800),
      bill(2, '2026-09-12', 23200, 1200),
      bill(1, '2026-09-03', 29000, 3000),
    ]
    const result = settleOldestFirst(bills, [payment('2026-09-05', 29000)])
    const byId = new Map(result.map((r) => [r.bill_id, r]))
    expect(byId.get(1)!.realisedProfit).toBe(3000)
    expect(byId.get(2)!.realisedProfit).toBe(0)
    expect(byId.get(3)!.realisedProfit).toBe(0)
  })

  it('splits a partly covered bill pro-rata', () => {
    const result = settleOldestFirst([bill(1, '2026-09-03', 29000, 3000)], [payment('2026-09-05', 14500)])
    expect(result[0].realisedFraction).toBe(0.5)
    expect(result[0].realisedProfit).toBe(1500)
    expect(result[0].pendingProfit).toBe(1500)
  })

  it('spans several bills with one payment', () => {
    const bills = [bill(1, '2026-09-03', 29000, 3000), bill(2, '2026-09-12', 23200, 1200)]
    const result = settleOldestFirst(bills, [payment('2026-09-20', 40600)])
    const byId = new Map(result.map((r) => [r.bill_id, r]))
    expect(byId.get(1)!.realisedFraction).toBe(1)
    expect(byId.get(2)!.realisedFraction).toBe(0.5)
    expect(byId.get(2)!.realisedProfit).toBe(600)
  })

  it('caps an overpayment at the bills that exist', () => {
    const result = settleOldestFirst([bill(1, '2026-09-03', 29000, 3000)], [payment('2026-09-05', 50000)])
    expect(result[0].realisedFraction).toBe(1)
    expect(result[0].pendingProfit).toBe(0)
  })

  it('realises nothing when there are no payments', () => {
    const result = settleOldestFirst([bill(1, '2026-09-03', 29000, 3000)], [])
    expect(result[0].realisedProfit).toBe(0)
    expect(result[0].pendingProfit).toBe(3000)
  })

  it('settles each customer from its own payment pool', () => {
    const bills = [bill(1, '2026-09-03', 29000, 3000), { ...bill(2, '2026-09-04', 29000, 3000), customer_id: 2 }]
    const result = settleOldestFirst(bills, [payment('2026-09-05', 29000)])
    const byId = new Map(result.map((r) => [r.bill_id, r]))
    expect(byId.get(1)!.realisedFraction).toBe(1)
    expect(byId.get(2)!.realisedFraction).toBe(0)
  })

  it('treats a zero-value bill as settled', () => {
    const result = settleOldestFirst([bill(1, '2026-09-03', 0, 0)], [])
    expect(result[0].realisedFraction).toBe(1)
  })

  it('breaks a created_at tie by bill_id, not by input order', () => {
    // Same timestamp, higher id listed first. Without the secondary key the
    // payment would settle whichever row the API happened to return first.
    const bills = [bill(2, '2026-09-03', 29000, 1200), bill(1, '2026-09-03', 29000, 3000)]
    const result = settleOldestFirst(bills, [payment('2026-09-05', 29000)])
    const byId = new Map(result.map((r) => [r.bill_id, r]))
    expect(byId.get(1)!.realisedFraction).toBe(1)
    expect(byId.get(2)!.realisedFraction).toBe(0)

    // Reversed input, same answer.
    const flipped = settleOldestFirst([...bills].reverse(), [payment('2026-09-05', 29000)])
    const byIdFlipped = new Map(flipped.map((r) => [r.bill_id, r]))
    expect(byIdFlipped.get(1)!.realisedFraction).toBe(1)
    expect(byIdFlipped.get(2)!.realisedFraction).toBe(0)
  })

  it('realises nothing rather than NaN when every line of a bill is uncosted', () => {
    const uncosted = { ...bill(1, '2026-09-03', 29000, 0), profit: null, cost_ex: null, gst_in: null, cost_known: false }
    const [settled] = settleOldestFirst([uncosted], [payment('2026-09-05', 29000)])
    expect(settled.realisedFraction).toBe(1)
    expect(settled.realisedProfit).toBe(0)
    expect(settled.pendingProfit).toBe(0)
  })
})

import { billsInWindow } from './profit'

describe('settle over history, then slice to the window', () => {
  it('does not let one payment realise a bill in two different months', () => {
    // Customer C: unpaid 29,000 on 5 Aug and on 10 Sep, one 29,000 payment.
    // Only the August bill is covered; the September screen must show its bill
    // pending, and the two months together must realise 29,000 once.
    const history = [bill(1, '2026-08-05', 29000, 1271), bill(2, '2026-09-10', 29000, 1271)]
    const settled = settleOldestFirst(history, [payment('2026-09-20', 29000)])

    const august = billsInWindow(settled, '2026-08-01', '2026-09-01')
    const september = billsInWindow(settled, '2026-09-01', '2026-10-01')

    expect(august.map((b) => b.bill_id)).toEqual([1])
    expect(september.map((b) => b.bill_id)).toEqual([2])
    expect(august[0].realisedFraction).toBe(1)
    expect(september[0].realisedFraction).toBe(0)
    expect(september[0].pendingProfit).toBe(1271)
  })

  it('agrees with the customer-screen view of the same bill', () => {
    // useCustomerProfit settles over the customer's full history with no slice.
    // The windowed path must reach the same realisedFraction for a given bill,
    // or Reports and CustomerDetail disagree about whether it is realised.
    const history = [bill(1, '2026-08-05', 29000, 1271), bill(2, '2026-09-10', 29000, 1271)]
    const payments = [payment('2026-09-20', 29000)]
    const customerView = new Map(settleOldestFirst(history, payments).map((b) => [b.bill_id, b]))
    const reportsView = billsInWindow(settleOldestFirst(history, payments), '2026-09-01', '2026-10-01')

    expect(reportsView[0].realisedFraction).toBe(customerView.get(2)!.realisedFraction)
  })

  it('excludes a bill on the last day of the window', () => {
    const settled = settleOldestFirst([bill(1, '2026-09-01', 1000, 100), bill(2, '2026-10-01', 1000, 100)], [])
    expect(billsInWindow(settled, '2026-09-01', '2026-10-01').map((b) => b.bill_id)).toEqual([1])
  })
})

import { summariseProfit, profitByCustomer, profitByProduct } from './profit'
import type { SettledBill as Settled } from './profit'
import type { BillLineProfit } from '../types/db'

function settled(over: Partial<Settled>): Settled {
  return {
    bill_id: 1, bill_number: 'B-1', customer_id: 1,
    created_at: '2026-09-03T10:00:00+05:30', day: '2026-09-03', paid: false,
    qty: 10, revenue_incl: 29000, revenue_ex: 24576.27, cost_ex: 23305.08,
    profit: 1271.19, gst_out: 4423.73, gst_in: 4194.91, cost_known: true,
    realisedFraction: 1, realisedProfit: 1271.19, pendingProfit: 0,
    ...over,
  }
}

function line(over: Partial<BillLineProfit>): BillLineProfit {
  return {
    bill_line_id: 1, bill_id: 1, bill_number: 'B-1', customer_id: 1,
    created_at: '2026-09-03T10:00:00+05:30', day: '2026-09-03', paid: false,
    product_id: 1, product_name: '19 kg', gst_rate: 18, qty: 10,
    revenue_incl: 29000, revenue_ex: 24576.27, gst_out: 4423.73,
    unit_cost_ex: 2330.51, cost_ex: 23305.08, gst_in: 4194.91,
    profit: 1271.19, cost_known: true, cost_source: 'PO-1',
    ...over,
  }
}

describe('summariseProfit', () => {
  it('totals revenue, cost, profit and margin ex-GST', () => {
    const s = summariseProfit([settled({}), settled({ bill_id: 2 })])
    expect(s.revenue).toBeCloseTo(49152.54, 2)
    expect(s.costedRevenue).toBeCloseTo(49152.54, 2)
    expect(s.profit).toBeCloseTo(2542.38, 2)
    expect(s.marginPct).toBeCloseTo(5.17, 2)
    expect(s.qty).toBe(20)
  })

  it('splits realised from pending', () => {
    const s = summariseProfit([
      settled({ realisedFraction: 1, realisedProfit: 1271.19, pendingProfit: 0 }),
      settled({ bill_id: 2, realisedFraction: 0, realisedProfit: 0, pendingProfit: 1271.19 }),
    ])
    expect(s.realised).toBeCloseTo(1271.19, 2)
    expect(s.pending).toBeCloseTo(1271.19, 2)
  })

  it('reports GST payable as output minus input credit', () => {
    const s = summariseProfit([settled({})])
    expect(s.gstPayable).toBeCloseTo(228.82, 2)
  })

  it('counts unknown-cost bills and keeps them out of profit', () => {
    const s = summariseProfit([settled({}), settled({ bill_id: 2, cost_known: false, profit: 0, cost_ex: 0 })])
    expect(s.unknownCostBills).toBe(1)
    expect(s.profit).toBeCloseTo(1271.19, 2)
  })

  it('measures margin against costed revenue, not total revenue', () => {
    // 100,000 billed, of which 29,000 has no cost behind it, on 22,000 profit.
    // Margin describes the 71,000 the profit was computed from — 31.0%, not the
    // 22.0% that dividing by the full revenue would report.
    const s = summariseProfit([
      settled({
        bill_id: 1, qty: 10, revenue_ex: 71000, cost_ex: 49000, profit: 22000,
        gst_out: 0, gst_in: 0, realisedProfit: 22000, pendingProfit: 0,
      }),
      settled({
        bill_id: 2, qty: 5, revenue_ex: 29000, cost_known: false,
        cost_ex: null, profit: null, gst_in: null, gst_out: 0,
        realisedProfit: 0, pendingProfit: 0,
      }),
    ])
    expect(s.revenue).toBe(100000)
    expect(s.costedRevenue).toBe(71000)
    expect(s.cost).toBe(49000)
    expect(s.profit).toBe(22000)
    expect(s.marginPct).toBeCloseTo(30.99, 2)
    // Revenue − cost = profit holds over the costed slice.
    expect(s.costedRevenue - s.cost).toBeCloseTo(s.profit, 2)
    // Total revenue and qty still report everything billed.
    expect(s.qty).toBe(15)
    expect(s.unknownCostBills).toBe(1)
  })

  it('returns a zero margin rather than NaN on empty input', () => {
    const s = summariseProfit([])
    expect(s.profit).toBe(0)
    expect(s.costedRevenue).toBe(0)
    expect(s.marginPct).toBe(0)
  })
})

describe('profitByCustomer', () => {
  it('groups by customer and sorts by profit descending', () => {
    const rows = profitByCustomer(
      [
        settled({ bill_id: 1, customer_id: 1, profit: 1000, realisedProfit: 1000, pendingProfit: 0 }),
        settled({ bill_id: 2, customer_id: 2, profit: 4000, realisedProfit: 0, pendingProfit: 4000 }),
        settled({ bill_id: 3, customer_id: 1, profit: 500, realisedProfit: 500, pendingProfit: 0 }),
      ],
      new Map([[1, 'Hotel Anand'], [2, 'Balaji Mess']]),
    )
    expect(rows.map((r) => r.name)).toEqual(['Balaji Mess', 'Hotel Anand'])
    expect(rows[1].profit).toBe(1500)
    expect(rows[1].realised).toBe(1500)
  })

  it('falls back to a placeholder when the name is unknown', () => {
    const rows = profitByCustomer([settled({ customer_id: 9 })], new Map())
    expect(rows[0].name).toBe('Customer 9')
  })
})

describe('profitByProduct', () => {
  it('groups lines by product and sorts by profit descending', () => {
    const rows = profitByProduct([
      line({ bill_line_id: 1, product_id: 1, product_name: '19 kg', profit: 1000, qty: 10 }),
      line({ bill_line_id: 2, product_id: 2, product_name: '47.5 kg', profit: 3000, qty: 4 }),
      line({ bill_line_id: 3, product_id: 1, product_name: '19 kg', profit: 500, qty: 5 }),
    ])
    expect(rows.map((r) => r.name)).toEqual(['47.5 kg', '19 kg'])
    expect(rows[1].qty).toBe(15)
    expect(rows[1].profit).toBe(1500)
  })

  it('skips unknown-cost lines', () => {
    const rows = profitByProduct([
      line({ bill_line_id: 1, bill_id: 1, product_id: 1, profit: 1000 }),
      line({ bill_line_id: 2, bill_id: 2, product_id: 1, cost_known: false, profit: null, cost_ex: null }),
    ])
    expect(rows[0].profit).toBe(1000)
  })

  it('drops the whole bill when one of its lines is uncosted, matching summariseProfit', () => {
    // Bill 1 mixes a costed line with an uncosted one; summariseProfit excludes
    // bill 1 entirely, so the by-product column must too or the breakdown sums
    // to more than the headline sitting next to it on screen.
    const rows = profitByProduct([
      line({ bill_line_id: 1, bill_id: 1, product_id: 1, profit: 1000, qty: 10 }),
      line({ bill_line_id: 2, bill_id: 1, product_id: 2, cost_known: false, profit: null, cost_ex: null, qty: 2 }),
      line({ bill_line_id: 3, bill_id: 2, product_id: 1, profit: 500, qty: 5 }),
    ])
    expect(rows).toHaveLength(1)
    expect(rows[0].productId).toBe(1)
    expect(rows[0].profit).toBe(500)
    expect(rows[0].qty).toBe(5)
  })
})
