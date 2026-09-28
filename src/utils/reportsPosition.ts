import type { SettledBill } from './profit'

/**
 * What one cylinder earned. The figure a distributor actually trades on: total
 * profit can rise on volume while every cylinder earns less, and only this
 * number shows that. Null when nothing moved, rather than a division by zero
 * dressed up as ₹0.
 */
export function perCylinder(profit: number, qty: number): number | null {
  if (qty <= 0) return null
  return profit / qty
}

export interface PaceTotals {
  profit: number
  revenue: number
}

/**
 * The same month measured only as far as `dayOfMonth`, so a month in progress
 * can be compared against a finished one. Without it, the 28th of September
 * reads as a collapse against the whole of August.
 *
 * Costing follows the headline: an uncosted bill contributes revenue but no
 * profit.
 */
export function paceThroughDay(bills: SettledBill[], dayOfMonth: number): PaceTotals {
  let profit = 0
  let revenue = 0
  for (const b of bills) {
    if (Number(b.day.slice(8, 10)) > dayOfMonth) continue
    revenue += b.revenue_ex
    if (b.cost_known && b.profit != null) profit += b.profit
  }
  return { profit, revenue }
}

export interface Debtor {
  customerId: number
  name: string
  due: number
  /** Days since the oldest bill of theirs that is still not fully covered. */
  oldestDays: number
}

const DAY_MS = 86_400_000

/**
 * Who to chase, oldest debt first rather than largest. A ₹90,000 bill written
 * last week is a normal credit cycle; ₹500 outstanding since June is a customer
 * who has stopped paying, and that is the call worth making.
 *
 * Age is measured from the oldest bill a payment has not fully reached, using
 * the same oldest-first realisation as the profit figures, so this list and the
 * pending total on the same screen cannot disagree.
 */
export function agedDebtors(
  bills: SettledBill[],
  names: Map<number, string>,
  today: string,
): Debtor[] {
  const todayMs = new Date(`${today}T00:00:00Z`).getTime()
  const byCustomer = new Map<number, Debtor>()

  for (const b of bills) {
    if (b.customer_id == null || b.paid) continue
    const outstanding = b.revenue_incl * (1 - b.realisedFraction)
    if (outstanding <= 0) continue

    const age = Math.round((todayMs - new Date(`${b.day}T00:00:00Z`).getTime()) / DAY_MS)
    const row = byCustomer.get(b.customer_id) ?? {
      customerId: b.customer_id,
      name: names.get(b.customer_id) ?? `Customer ${b.customer_id}`,
      due: 0,
      oldestDays: 0,
    }
    row.due += outstanding
    row.oldestDays = Math.max(row.oldestDays, age)
    byCustomer.set(b.customer_id, row)
  }

  return [...byCustomer.values()].sort((a, b) => b.oldestDays - a.oldestDays || b.due - a.due)
}

/** What the agency still owes the supplier, across every unpaid order. */
export function supplierDues(orders: { total_amount: number; paid: boolean }[]): number {
  return orders.reduce((sum, po) => (po.paid ? sum : sum + Number(po.total_amount ?? 0)), 0)
}

interface RateSource {
  created_at: string
  purchase_lines: { product_id: number; qty: number; amount: number }[]
}

/**
 * Replacement cost per product, from the most recent order that bought it —
 * the same basis the profit views use. The OMC revises rates monthly, so an
 * average across history would value today's godown at last quarter's prices.
 */
export function latestRates(orders: RateSource[]): Map<number, number> {
  const newestFirst = [...orders].sort((a, b) => b.created_at.localeCompare(a.created_at))
  const rates = new Map<number, number>()
  for (const order of newestFirst) {
    for (const line of order.purchase_lines) {
      if (rates.has(line.product_id) || line.qty <= 0) continue
      rates.set(line.product_id, Number(line.amount) / line.qty)
    }
  }
  return rates
}

/**
 * Capital sitting in the godown. Full cylinders only: an empty is the
 * customer's deposit coming back, not stock the agency paid for. A product
 * never purchased is skipped rather than valued at zero, which would quietly
 * understate the total.
 */
export function stockValue(
  stock: { product_id: number; full_cylinders: number }[],
  rates: Map<number, number>,
): number {
  return stock.reduce((sum, row) => {
    const rate = rates.get(row.product_id)
    return rate == null ? sum : sum + rate * row.full_cylinders
  }, 0)
}
