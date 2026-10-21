import type { BillLineProfit } from '../types/db'
import type { BillWithLines } from '../hooks/useBills'
import { formatCurrency, formatRelativeDate } from './format'
import type { HistoryEntry, HistoryGroup } from './statement'

// Shared by the customer page and the activity popups so a bill reads the same
// wherever it is opened.

export function historyAmount(t: HistoryEntry) {
  if (t.type === 'return') return t.surrender ? `${t.qty}` : `−${t.qty}`
  return formatCurrency(t.amount)
}

function dayKey(iso: string) {
  const d = new Date(iso)
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`
}

export function flattenBills(bills: BillWithLines[], productNameById: Map<number, string>): HistoryEntry[] {
  const entries: HistoryEntry[] = []
  for (const bill of bills) {
    if (bill.type === 'payment' || bill.bill_lines.length === 0) {
      entries.push({
        ...bill,
        balanceAfter: 0,
        productName: null,
        qty: 0,
        empties: 0,
        amount: bill.total_amount,
        lines: [],
      })
    } else {
      const line = bill.bill_lines[0]
      const totalQty = bill.bill_lines.reduce((s, l) => s + l.qty, 0)
      const totalEmpties = bill.bill_lines.reduce((s, l) => s + l.empties, 0)
      entries.push({
        ...bill,
        balanceAfter: 0,
        productName: line.product_id ? productNameById.get(line.product_id) ?? null : null,
        qty: totalQty,
        empties: totalEmpties,
        amount: bill.total_amount,
        lines: bill.bill_lines.map((l) => ({
          productName: l.product_id ? productNameById.get(l.product_id) ?? null : null,
          qty: l.qty,
          empties: l.empties,
          amount: l.amount,
        })),
      })
    }
  }
  return entries
}

export function buildHistoryGroups(bills: BillWithLines[], productNameById: Map<number, string>): HistoryGroup[] {
  const flat = flattenBills(bills, productNameById)
  const chronological = [...flat].reverse()
  let running = 0
  const withBalance: HistoryEntry[] = chronological.map((t) => {
    if (t.type === 'sale' && !t.paid) running += t.amount
    else if (t.type === 'payment') running -= t.amount
    return { ...t, balanceAfter: running }
  })
  const newestFirst = [...withBalance].reverse()

  const groups: HistoryGroup[] = []
  for (const t of newestFirst) {
    const key = dayKey(t.created_at)
    let group = groups.find((g) => g.key === key)
    if (!group) {
      group = { key, label: formatRelativeDate(t.created_at), entries: [], sales: 0, returns: 0, collected: 0 }
      groups.push(group)
    }
    group.entries.push(t)
    if (t.type === 'sale') group.sales += 1
    if (t.type === 'return') group.returns += 1
    if (t.type === 'payment') group.collected += t.amount
    if (t.type === 'sale' && t.paid) group.collected += t.amount
  }
  return groups
}

export function detailRows(
  t: HistoryEntry,
  profitLines: BillLineProfit[] = [],
  billLinesError: string | null = null,
): { k: string; v: string }[] {
  const rows: { k: string; v: string }[] = []
  if (t.type !== 'sale' && t.productName) rows.push({ k: 'Product', v: t.productName })
  if (t.type === 'sale') {
    if (t.surrender) rows.push({ k: 'Type', v: 'New Connection' })
    else rows.push({ k: 'Empties collected', v: String(t.empties) })
    if (t.lines.length === 0) rows.push({ k: 'Payment', v: t.paid ? `Paid${t.method ? ` · ${t.method === 'upi' ? 'UPI' : 'Cash'}` : ''}` : 'On credit' })
  } else if (t.type === 'return') {
    rows.push({ k: 'Quantity', v: String(t.qty) })
    if (t.surrender) rows.push({ k: 'Surrender', v: 'Customer surrendered cylinder' })
  } else if (t.type === 'payment' && t.method) {
    rows.push({ k: 'Method', v: t.method === 'upi' ? 'UPI' : 'Cash' })
  }
  if (t.note) rows.push({ k: 'Note', v: t.note })
  // Counter bills have no customer, so there is no running balance to show.
  if (t.customer_id != null) rows.push({ k: 'Balance after', v: formatCurrency(t.balanceAfter) })
  if (t.type === 'sale' && profitLines.length > 0) {
    for (const l of profitLines) {
      // bill_line_id keeps the row key unique per line — nothing in the schema
      // stops two lines on the same bill sharing a product_id.
      rows.push({
        k: `Cost · ${l.product_name} · #${l.bill_line_id}`,
        v: l.cost_known ? `${formatCurrency(l.unit_cost_ex ?? 0)} × ${l.qty}${l.cost_source ? ` (${l.cost_source})` : ''}` : 'unknown',
      })
      rows.push({ k: `Profit · ${l.product_name} · #${l.bill_line_id}`, v: l.cost_known ? formatCurrency(l.profit ?? 0) : '—' })
    }
  } else if (t.type === 'sale' && billLinesError) {
    rows.push({ k: 'Margin', v: 'Could not load' })
  }
  return rows
}

