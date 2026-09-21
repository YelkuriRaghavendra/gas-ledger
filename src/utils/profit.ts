import type { BillProfit, PaymentBill } from '../types/db'

export interface SettledBill extends BillProfit {
  realisedFraction: number
  realisedProfit: number
  pendingProfit: number
}

// Payments are recorded as standalone bills with no lines (RecordPayment.tsx),
// so they never flip the originating sale's `paid` flag — that flag means only
// "settled at the counter". Realisation is therefore derived: money received
// pays off the oldest outstanding bills first, the way the trade actually works.
//
// Counter-paid sales are fully realised on their own date and stay out of the
// credit queue, because their money never appeared as a payment bill.
export function settleOldestFirst(bills: BillProfit[], payments: PaymentBill[]): SettledBill[] {
  const pool = new Map<number, number>()
  for (const p of payments) {
    if (p.customer_id == null) continue
    pool.set(p.customer_id, (pool.get(p.customer_id) ?? 0) + p.total_amount)
  }

  const credit = bills
    .filter((b) => !b.paid)
    .slice()
    .sort((a, b) => a.created_at.localeCompare(b.created_at))

  const fractions = new Map<number, number>()
  for (const b of credit) {
    if (b.revenue_incl <= 0) {
      fractions.set(b.bill_id, 1)
      continue
    }
    const key = b.customer_id ?? -1
    const available = pool.get(key) ?? 0
    const covered = Math.min(b.revenue_incl, Math.max(0, available))
    pool.set(key, available - covered)
    fractions.set(b.bill_id, covered / b.revenue_incl)
  }

  return bills.map((b) => {
    const fraction = b.paid ? 1 : (fractions.get(b.bill_id) ?? 0)
    const realisedProfit = b.profit * fraction
    return {
      ...b,
      realisedFraction: fraction,
      realisedProfit,
      pendingProfit: b.profit - realisedProfit,
    }
  })
}

import type { BillLineProfit } from '../types/db'

export interface ProfitSummary {
  revenue: number
  cost: number
  profit: number
  marginPct: number
  realised: number
  pending: number
  qty: number
  gstOut: number
  gstIn: number
  gstPayable: number
  unknownCostBills: number
}

export interface CustomerProfit {
  customerId: number
  name: string
  qty: number
  profit: number
  realised: number
  pending: number
}

export interface ProductProfit {
  productId: number
  name: string
  qty: number
  revenue: number
  cost: number
  profit: number
}

// Bills whose cost could not be resolved contribute revenue context but never
// profit — costing them at zero would report infinite margin. The count is
// surfaced on screen so a missing purchase order is visible rather than silent.
export function summariseProfit(bills: SettledBill[]): ProfitSummary {
  let revenue = 0, cost = 0, profit = 0, realised = 0, pending = 0
  let qty = 0, gstOut = 0, gstIn = 0, unknownCostBills = 0

  for (const b of bills) {
    revenue += b.revenue_ex
    gstOut += b.gst_out
    qty += b.qty
    if (!b.cost_known) {
      unknownCostBills += 1
      continue
    }
    cost += b.cost_ex
    gstIn += b.gst_in
    profit += b.profit
    realised += b.realisedProfit
    pending += b.pendingProfit
  }

  return {
    revenue, cost, profit,
    marginPct: revenue > 0 ? (profit / revenue) * 100 : 0,
    realised, pending, qty, gstOut, gstIn,
    gstPayable: gstOut - gstIn,
    unknownCostBills,
  }
}

export function profitByCustomer(bills: SettledBill[], names: Map<number, string>): CustomerProfit[] {
  const acc = new Map<number, CustomerProfit>()
  for (const b of bills) {
    if (b.customer_id == null || !b.cost_known) continue
    const row = acc.get(b.customer_id) ?? {
      customerId: b.customer_id,
      name: names.get(b.customer_id) ?? `Customer ${b.customer_id}`,
      qty: 0, profit: 0, realised: 0, pending: 0,
    }
    row.qty += b.qty
    row.profit += b.profit
    row.realised += b.realisedProfit
    row.pending += b.pendingProfit
    acc.set(b.customer_id, row)
  }
  return [...acc.values()].sort((a, b) => b.profit - a.profit)
}

export function profitByProduct(lines: BillLineProfit[]): ProductProfit[] {
  const acc = new Map<number, ProductProfit>()
  for (const l of lines) {
    if (!l.cost_known || l.profit == null || l.cost_ex == null) continue
    const row = acc.get(l.product_id) ?? {
      productId: l.product_id, name: l.product_name,
      qty: 0, revenue: 0, cost: 0, profit: 0,
    }
    row.qty += l.qty
    row.revenue += l.revenue_ex
    row.cost += l.cost_ex
    row.profit += l.profit
    acc.set(l.product_id, row)
  }
  return [...acc.values()].sort((a, b) => b.profit - a.profit)
}
