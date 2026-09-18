import { describe, it, expect } from 'vitest'
import { emptiesGiven, groupPurchases, purchaseSubtitle, purchaseTitle, summarisePurchases } from './purchases'
import type { PurchaseOrderWithLines } from '../hooks/usePurchaseOrders'

const NAMES = new Map([
  [1, '19kg Commercial'],
  [2, '47.5kg Industrial'],
  [3, '5kg'],
])

// Fixed "now" so relative grouping is deterministic: Fri 18 Sep 2026.
const NOW = new Date(2026, 8, 18, 12, 0, 0)

function po(
  id: number,
  createdAt: string,
  total: number,
  lines: { product_id: number; qty: number; empties_given?: number; amount?: number }[],
): PurchaseOrderWithLines {
  return {
    id,
    po_number: `PO-${String(id).padStart(4, '0')}`,
    type: 'purchase',
    total_amount: total,
    paid: true,
    note: null,
    created_by: null,
    created_at: createdAt,
    updated_at: createdAt,
    updated_by: null,
    purchase_lines: lines.map((l, i) => ({
      id: id * 100 + i,
      purchase_order_id: id,
      product_id: l.product_id,
      qty: l.qty,
      empties_given: l.empties_given ?? 0,
      amount: l.amount ?? 0,
      created_by: null,
      created_at: createdAt,
      updated_at: createdAt,
      updated_by: null,
    })),
  } as PurchaseOrderWithLines
}

describe('purchaseTitle', () => {
  it('names the product for a single-line order', () => {
    expect(purchaseTitle(po(1, '2026-09-18', 54000, [{ product_id: 1, qty: 60 }]), NAMES))
      .toBe('60 × 19kg Commercial')
  })

  it('summarises a multi-product order by product count', () => {
    const order = po(2, '2026-09-06', 27300, [
      { product_id: 1, qty: 10 },
      { product_id: 2, qty: 4 },
      { product_id: 3, qty: 6 },
    ])
    expect(purchaseTitle(order, NAMES)).toBe('Mixed · 3 products')
  })

  it('falls back when a product name is missing', () => {
    expect(purchaseTitle(po(3, '2026-09-18', 100, [{ product_id: 99, qty: 5 }]), NAMES))
      .toBe('5 × cylinders')
  })

  it('does not crash on an order with no lines', () => {
    expect(purchaseTitle(po(4, '2026-09-18', 0, []), NAMES)).toBe('No items')
  })
})

describe('emptiesGiven', () => {
  it('sums empties across lines', () => {
    const order = po(5, '2026-09-18', 0, [
      { product_id: 1, qty: 10, empties_given: 8 },
      { product_id: 2, qty: 4, empties_given: 4 },
    ])
    expect(emptiesGiven(order)).toBe(12)
  })

  it('is zero when no empties went back', () => {
    expect(emptiesGiven(po(6, '2026-09-18', 0, [{ product_id: 1, qty: 10 }]))).toBe(0)
  })
})

describe('purchaseSubtitle', () => {
  // Real PO numbers here look like PO-20260913-0001 — long enough to push the
  // empties figure out of the row. The number lives in the detail sheet; the
  // row carries only what is worth scanning.
  it('shows the date and empties when some went back', () => {
    const order = po(42, '2026-09-18T09:00:00', 54000, [{ product_id: 1, qty: 60, empties_given: 40 }])
    expect(purchaseSubtitle(order)).toBe('18 Sep · 40 empties given')
  })

  it('omits the empties clause entirely when none went back', () => {
    const order = po(42, '2026-09-18T09:00:00', 54000, [{ product_id: 1, qty: 60 }])
    expect(purchaseSubtitle(order)).toBe('18 Sep')
  })

  it('says 1 empty rather than 1 empties', () => {
    const order = po(42, '2026-09-18T09:00:00', 900, [{ product_id: 1, qty: 1, empties_given: 1 }])
    expect(purchaseSubtitle(order)).toBe('18 Sep · 1 empty given')
  })

  it('never includes the PO number, however long it is', () => {
    const order = po(42, '2026-09-18T09:00:00', 900, [{ product_id: 1, qty: 1, empties_given: 1 }])
    order.po_number = 'PO-20260918-0001'
    expect(purchaseSubtitle(order)).not.toContain('PO-')
  })
})

describe('summarisePurchases', () => {
  const orders = [
    po(1, '2026-09-18T09:00:00', 54000, [{ product_id: 1, qty: 60, empties_given: 40 }]),
    po(2, '2026-09-11T09:00:00', 72000, [{ product_id: 1, qty: 80, empties_given: 72 }]),
    // Last month — must be excluded from a this-month summary.
    po(3, '2026-08-28T09:00:00', 30000, [{ product_id: 1, qty: 30, empties_given: 30 }]),
  ]

  it('totals only the current month', () => {
    const s = summarisePurchases(orders, NOW)
    expect(s.spend).toBe(126000)
    expect(s.orderCount).toBe(2)
  })

  it('counts cylinders in and empties out', () => {
    const s = summarisePurchases(orders, NOW)
    expect(s.cylindersIn).toBe(140)
    expect(s.emptiesOut).toBe(112)
  })

  it('averages spend per cylinder', () => {
    const s = summarisePurchases(orders, NOW)
    expect(s.avgPerCylinder).toBe(900)
  })

  it('reports zeros for a month with no purchases, without dividing by zero', () => {
    const s = summarisePurchases([], NOW)
    expect(s).toEqual({ spend: 0, orderCount: 0, cylindersIn: 0, emptiesOut: 0, avgPerCylinder: 0 })
  })

  it('avoids NaN when orders exist but no cylinders were bought', () => {
    const s = summarisePurchases([po(9, '2026-09-18T09:00:00', 500, [])], NOW)
    expect(s.avgPerCylinder).toBe(0)
  })
})

describe('groupPurchases', () => {
  const orders = [
    po(1, '2026-09-18T09:00:00', 54000, [{ product_id: 1, qty: 60 }]),
    po(2, '2026-09-16T09:00:00', 14700, [{ product_id: 2, qty: 18 }]),
    po(3, '2026-09-06T09:00:00', 27300, [{ product_id: 1, qty: 30 }]),
    po(4, '2026-08-20T09:00:00', 30000, [{ product_id: 1, qty: 30 }]),
    po(5, '2025-12-02T09:00:00', 11000, [{ product_id: 1, qty: 12 }]),
  ]

  it('puts the last seven days under This week', () => {
    const g = groupPurchases(orders, NOW)
    expect(g[0].label).toBe('This week')
    expect(g[0].orders.map((o) => o.id)).toEqual([1, 2])
  })

  it('separates the rest of the current month', () => {
    const g = groupPurchases(orders, NOW)
    expect(g[1].label).toBe('Earlier this month')
    expect(g[1].orders.map((o) => o.id)).toEqual([3])
  })

  it('labels older months by name, and includes the year only when it differs', () => {
    const g = groupPurchases(orders, NOW)
    expect(g[2].label).toBe('August')
    expect(g[3].label).toBe('December 2025')
  })

  it('subtotals each group', () => {
    const g = groupPurchases(orders, NOW)
    expect(g[0].subtotal).toBe(68700)
    expect(g[1].subtotal).toBe(27300)
  })

  it('omits groups that have no orders', () => {
    const g = groupPurchases([po(1, '2026-08-20T09:00:00', 100, [{ product_id: 1, qty: 1 }])], NOW)
    expect(g.map((x) => x.label)).toEqual(['August'])
  })

  it('returns nothing for no orders', () => {
    expect(groupPurchases([], NOW)).toEqual([])
  })

  it('gives every group a stable key', () => {
    const g = groupPurchases(orders, NOW)
    const keys = g.map((x) => x.key)
    expect(new Set(keys).size).toBe(keys.length)
  })
})
