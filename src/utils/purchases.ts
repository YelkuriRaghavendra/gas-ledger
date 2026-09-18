import type { PurchaseOrderWithLines } from '../hooks/usePurchaseOrders'

const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const DAYS_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

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

/**
 * Line under the title. The day is already the group heading and the PO number
 * is a long opaque serial (`PO-20260913-0001`) that pushed this figure out of
 * the row on a phone — so the row carries only the empties, the number most
 * often disputed with the supplier. The PO number has its own line in the
 * detail sheet.
 */
export function purchaseSubtitle(po: PurchaseOrderWithLines): string {
  const empties = emptiesGiven(po)
  if (empties === 0) return 'No empties given'
  return `${empties} ${empties === 1 ? 'empty' : 'empties'} given`
}

/** Orders within one calendar month. `month` is 1-12. */
export function purchasesInMonth(
  orders: PurchaseOrderWithLines[],
  year: number,
  month: number,
): PurchaseOrderWithLines[] {
  return orders.filter((po) => {
    const d = new Date(po.created_at)
    return d.getFullYear() === year && d.getMonth() === month - 1
  })
}

export interface PurchaseSummary {
  spend: number
  orderCount: number
  cylindersIn: number
  emptiesOut: number
}

/** Totals over exactly the orders given — the caller decides the period. */
export function summarisePurchases(orders: PurchaseOrderWithLines[]): PurchaseSummary {
  let spend = 0
  let cylindersIn = 0
  let emptiesOut = 0

  for (const po of orders) {
    spend += Number(po.total_amount ?? 0)
    for (const l of po.purchase_lines) {
      cylindersIn += l.qty ?? 0
      emptiesOut += l.empties_given ?? 0
    }
  }

  return {
    spend,
    orderCount: orders.length,
    cylindersIn,
    emptiesOut,
  }
}

export interface PurchaseGroup {
  key: string
  label: string
  subtotal: number
  orders: PurchaseOrderWithLines[]
}

/**
 * One group per day, newest first. Callers pass a single month's orders, so the
 * label needs no month-year context beyond the date itself; the weekday earns
 * its place because deliveries run on a weekly rhythm.
 */
export function groupPurchasesByDay(orders: PurchaseOrderWithLines[]): PurchaseGroup[] {
  const byDay = new Map<string, PurchaseOrderWithLines[]>()

  for (const po of orders) {
    const d = new Date(po.created_at)
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    const bucket = byDay.get(key) ?? []
    bucket.push(po)
    byDay.set(key, bucket)
  }

  return [...byDay.entries()]
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([key, dayOrders]) => {
      const sorted = [...dayOrders].sort(
        (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
      )
      const d = new Date(sorted[0].created_at)
      return {
        key,
        label: `${DAYS_SHORT[d.getDay()]}, ${String(d.getDate()).padStart(2, '0')} ${MONTHS_SHORT[d.getMonth()]}`,
        subtotal: sorted.reduce((total, po) => total + Number(po.total_amount ?? 0), 0),
        orders: sorted,
      }
    })
}
