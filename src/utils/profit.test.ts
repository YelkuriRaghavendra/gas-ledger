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
