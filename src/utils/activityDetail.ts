import { formatCurrency } from './format'
import type { FeedItem } from '../hooks/useActivityFeed'

// Shared presentation helpers for an activity-feed entry, used by both the
// Activity page and Home's recent-activity list so the two stay in sync.

export const TYPE_LABEL: Record<FeedItem['type'], string> = {
  sale: 'Sale',
  return: 'Return',
  payment: 'Payment',
  purchase: 'Purchase',
}

export function subtitleFor(entry: FeedItem) {
  if (entry.type === 'sale') {
    const prefix = `${entry.qty}${entry.product_name ? ` ${entry.product_name}` : ''} sold`
    return entry.outright ? `${prefix} · Outright` : `${prefix} · ${entry.empties} empties in`
  }
  if (entry.type === 'return') {
    const product = entry.product_name ? `${entry.product_name} ` : ''
    return entry.outright ? `${product}returned · Outright` : `${product}empties returned`
  }
  if (entry.type === 'purchase') return `Purchase · ${entry.qty} in`
  return 'Payment received'
}

export function detailTitle(entry: FeedItem) {
  const counterparty = entry.type === 'purchase' ? entry.product_name ?? '' : entry.title
  return `${TYPE_LABEL[entry.type]} · ${counterparty}`
}

export function detailRows(entry: FeedItem): { k: string; v: string }[] {
  const rows: { k: string; v: string }[] = []
  if (entry.type === 'sale') {
    if (entry.product_name) rows.push({ k: 'Product', v: entry.product_name })
    rows.push({ k: 'Quantity sold', v: String(entry.qty) })
    if (entry.outright) rows.push({ k: 'Outright', v: 'Customer owns cylinder' })
    else rows.push({ k: 'Empties collected', v: String(entry.empties) })
    if (entry.note) rows.push({ k: 'Note', v: entry.note })
  } else if (entry.type === 'purchase') {
    if (entry.product_name) rows.push({ k: 'Product', v: entry.product_name })
    rows.push({ k: 'Quantity in', v: String(entry.qty) })
    rows.push({ k: 'Empties given', v: String(entry.empties) })
    if (entry.note) rows.push({ k: 'Note', v: entry.note })
  } else if (entry.type === 'return') {
    if (entry.product_name) rows.push({ k: 'Product', v: entry.product_name })
    rows.push({ k: 'Quantity', v: String(entry.qty) })
    if (entry.outright) rows.push({ k: 'Outright', v: 'Customer owns cylinder' })
  } else if (entry.type === 'payment') {
    rows.push({ k: 'Amount', v: formatCurrency(entry.amount) })
  }
  return rows
}

export function editPath(entry: FeedItem) {
  if (entry.type === 'purchase') return `/commercial/purchases/${entry.id}/edit`
  return `/commercial/customers/${entry.customer_id}/${entry.type}/${entry.id}/edit`
}
