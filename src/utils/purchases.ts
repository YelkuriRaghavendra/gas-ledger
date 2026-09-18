import type { PurchaseOrderWithLines } from '../hooks/usePurchaseOrders'

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

/** What the order bought, for the list row. */
export function purchaseTitle(po: PurchaseOrderWithLines, productNameById: Map<number, string>): string {
  const lines = po.purchase_lines
  if (lines.length === 0) return 'No items'
  if (lines.length === 1) {
    const name = productNameById.get(lines[0].product_id) ?? 'cylinders'
    return `${lines[0].qty} × ${name}`
  }
  // Naming every product would not fit the row; the count is what the reader
  // needs to decide whether to open it.
  return `Mixed · ${lines.length} products`
}

/** Empties handed back to the supplier on this order, across all lines. */
export function emptiesGiven(po: PurchaseOrderWithLines): number {
  return po.purchase_lines.reduce((sum, l) => sum + (l.empties_given ?? 0), 0)
}

function shortDate(iso: string): string {
  const d = new Date(iso)
  return `${String(d.getDate()).padStart(2, '0')} ${MONTHS[d.getMonth()].slice(0, 3)}`
}

/**
 * Line under the title: when, and how many empties went back — the number most
 * often argued over with the supplier.
 *
 * Deliberately no PO number. Real ones run to `PO-20260913-0001`, which pushed
 * the empties figure out of the row on a phone, and an opaque serial is not
 * what anyone scans a list for. It has its own line in the detail sheet.
 */
export function purchaseSubtitle(po: PurchaseOrderWithLines): string {
  const parts = [shortDate(po.created_at)]
  const empties = emptiesGiven(po)
  if (empties > 0) parts.push(`${empties} ${empties === 1 ? 'empty' : 'empties'} given`)
  return parts.join(' · ')
}

export interface PurchaseSummary {
  spend: number
  orderCount: number
  cylindersIn: number
  emptiesOut: number
  avgPerCylinder: number
}

/** Totals for the calendar month `now` falls in. */
export function summarisePurchases(
  orders: PurchaseOrderWithLines[],
  now: Date = new Date(),
): PurchaseSummary {
  const month = now.getMonth()
  const year = now.getFullYear()

  let spend = 0
  let orderCount = 0
  let cylindersIn = 0
  let emptiesOut = 0

  for (const po of orders) {
    const d = new Date(po.created_at)
    if (d.getMonth() !== month || d.getFullYear() !== year) continue
    spend += Number(po.total_amount ?? 0)
    orderCount += 1
    for (const l of po.purchase_lines) {
      cylindersIn += l.qty ?? 0
      emptiesOut += l.empties_given ?? 0
    }
  }

  return {
    spend,
    orderCount,
    cylindersIn,
    emptiesOut,
    // An order can carry a cost with no cylinders; never divide by zero.
    avgPerCylinder: cylindersIn > 0 ? Math.round(spend / cylindersIn) : 0,
  }
}

export interface PurchaseGroup {
  key: string
  label: string
  subtotal: number
  orders: PurchaseOrderWithLines[]
}

function startOfDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate())
}

/**
 * Orders bucketed for reading: the last seven days, the rest of this month,
 * then one bucket per older month. Empty buckets are dropped.
 */
export function groupPurchases(
  orders: PurchaseOrderWithLines[],
  now: Date = new Date(),
): PurchaseGroup[] {
  const weekAgo = startOfDay(now).getTime() - 6 * 86400000
  const month = now.getMonth()
  const year = now.getFullYear()

  const week: PurchaseOrderWithLines[] = []
  const thisMonth: PurchaseOrderWithLines[] = []
  const older = new Map<string, { label: string; orders: PurchaseOrderWithLines[] }>()

  for (const po of orders) {
    const d = new Date(po.created_at)
    if (d.getTime() >= weekAgo) {
      week.push(po)
    } else if (d.getMonth() === month && d.getFullYear() === year) {
      thisMonth.push(po)
    } else {
      const key = `${d.getFullYear()}-${String(d.getMonth()).padStart(2, '0')}`
      // The year is noise while it matches the current one.
      const label = d.getFullYear() === year ? MONTHS[d.getMonth()] : `${MONTHS[d.getMonth()]} ${d.getFullYear()}`
      const bucket = older.get(key) ?? { label, orders: [] }
      bucket.orders.push(po)
      older.set(key, bucket)
    }
  }

  const sum = (list: PurchaseOrderWithLines[]) =>
    list.reduce((total, po) => total + Number(po.total_amount ?? 0), 0)

  const groups: PurchaseGroup[] = []
  if (week.length) groups.push({ key: 'week', label: 'This week', subtotal: sum(week), orders: week })
  if (thisMonth.length) {
    groups.push({ key: 'month', label: 'Earlier this month', subtotal: sum(thisMonth), orders: thisMonth })
  }
  for (const [key, bucket] of [...older.entries()].sort((a, b) => b[0].localeCompare(a[0]))) {
    groups.push({ key, label: bucket.label, subtotal: sum(bucket.orders), orders: bucket.orders })
  }
  return groups
}
