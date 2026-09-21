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

  it('returns a zero margin rather than NaN on empty input', () => {
    const s = summariseProfit([])
    expect(s.profit).toBe(0)
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
      line({ bill_line_id: 1, product_id: 1, profit: 1000 }),
      line({ bill_line_id: 2, product_id: 1, cost_known: false, profit: null, cost_ex: null }),
    ])
    expect(rows[0].profit).toBe(1000)
  })
})
