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

  // bill_id breaks a created_at tie. Two bills written in the same second — a
  // realistic counter burst — would otherwise settle in whatever order the API
  // happened to return, so the same data could realise different bills on two
  // successive loads.
  const credit = bills
    .filter((b) => !b.paid)
    .slice()
    .sort((a, b) => a.created_at.localeCompare(b.created_at) || a.bill_id - b.bill_id)

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
    // `profit` is sum() over the bill's lines and is SQL NULL when every line
    // has unknown cost. A null bill realises nothing rather than NaN; it is
    // excluded from the totals by `cost_known` anyway.
    const profit = b.profit ?? 0
    const realisedProfit = profit * fraction
    return {
      ...b,
      realisedFraction: fraction,
      realisedProfit,
      pendingProfit: profit - realisedProfit,
    }
  })
}

// Settlement must run over a customer's WHOLE bill history and only then be
// sliced to the month on screen. settleOldestFirst ignores payment dates: it
// pools a customer's payments and applies them in bill order. Run it on a
// one-month slice and that lifetime pool is handed to a one-month queue, so a
// single payment can realise an August bill on the August screen and a
// September bill on the September screen — the same rupees counted twice.
//
// Bills after the window are harmless (they queue behind the ones inside it and
// cannot take coverage away from them), but bills before it consume the pool
// first and must be present. Half-open [start, end) on the IST `day` column,
// matching useMonthSummary.
export function billsInWindow<T extends { day: string }>(bills: T[], start: string, end: string): T[] {
  return bills.filter((b) => b.day >= start && b.day < end)
}

import type { BillLineProfit } from '../types/db'

export interface ProfitSummary {
  revenue: number
  // Revenue of the bills that actually carry a cost — the denominator behind
  // `marginPct`. Equals `revenue` whenever `unknownCostBills` is 0. Exposed
  // rather than kept local so the relationship is inspectable on screen and in
  // tests instead of being an implicit property of the percentage.
  costedRevenue: number
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
//
// Revenue and qty stay whole-period figures: the owner wants to see everything
// that was billed. Margin, though, is measured against `costedRevenue` only, so
// the percentage describes exactly the bills the profit was computed from.
// Dividing costed profit by uncosted-inclusive revenue would silently understate
// margin by the share of revenue that has no cost behind it.
export function summariseProfit(bills: SettledBill[]): ProfitSummary {
  let revenue = 0, costedRevenue = 0, cost = 0, profit = 0, realised = 0, pending = 0
  let qty = 0, gstOut = 0, gstIn = 0, unknownCostBills = 0

  for (const b of bills) {
    revenue += b.revenue_ex
    gstOut += b.gst_out
    qty += b.qty
    // cost_ex / profit / gst_in are sum() over the bill's lines and arrive as
    // null when no line could be costed. cost_known already excludes those, but
    // the null check is explicit so a future change to the flag cannot quietly
    // coerce null into 0.
    if (!b.cost_known || b.cost_ex == null || b.profit == null || b.gst_in == null) {
      unknownCostBills += 1
      continue
    }
    costedRevenue += b.revenue_ex
    cost += b.cost_ex
    gstIn += b.gst_in
    profit += b.profit
    realised += b.realisedProfit
    pending += b.pendingProfit
  }

  return {
    revenue, costedRevenue, cost, profit,
    marginPct: costedRevenue > 0 ? (profit / costedRevenue) * 100 : 0,
    realised, pending, qty, gstOut, gstIn,
    gstPayable: gstOut - gstIn,
    unknownCostBills,
  }
}

export function profitByCustomer(bills: SettledBill[], names: Map<number, string>): CustomerProfit[] {
  const acc = new Map<number, CustomerProfit>()
  for (const b of bills) {
    if (b.customer_id == null || !b.cost_known || b.profit == null) continue
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

// Excludes the WHOLE bill when any one of its lines has unknown cost, matching
// summariseProfit rather than merely dropping the offending line. Line-level
// exclusion was the other option, and is arguably the more informative one, but
// it makes the by-product column sum to more than the headline on a mixed bill —
// the two figures sit on the same screen, and a breakdown that does not add up
// to its own total reads as a bug. Whole-bill exclusion also matches what the
// "N bills excluded" banner already tells the user is missing.
export function profitByProduct(lines: BillLineProfit[]): ProductProfit[] {
  const uncostedBills = new Set<number>()
  for (const l of lines) {
    if (!l.cost_known || l.profit == null || l.cost_ex == null) uncostedBills.add(l.bill_id)
  }

  const acc = new Map<number, ProductProfit>()
  for (const l of lines) {
    if (uncostedBills.has(l.bill_id)) continue
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
