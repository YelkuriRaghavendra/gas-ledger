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
