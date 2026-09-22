import { describe, it, expect } from 'vitest'
import {
  emptiesGiven,
  groupPurchasesByDay,
  purchaseSubtitle,
  purchaseTitle,
  purchasesInMonth,
  summarisePurchases,
} from './purchases'
import type { PurchaseOrderWithLines } from '../hooks/usePurchaseOrders'

const NAMES = new Map([
  [1, '19kg Commercial'],
  [2, '47.5kg Industrial'],
  [3, '5kg'],
])

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
  // The day is already the group heading, so the row carries only the empties.
  it('reports the empties that went back', () => {
    const order = po(42, '2026-09-18T09:00:00', 54000, [{ product_id: 1, qty: 60, empties_given: 40 }])
    expect(purchaseSubtitle(order)).toBe('40 empties given')
  })

  it('says none went back rather than leaving the line blank', () => {
    const order = po(42, '2026-09-18T09:00:00', 54000, [{ product_id: 1, qty: 60 }])
    expect(purchaseSubtitle(order)).toBe('No empties given')
  })

  it('says 1 empty rather than 1 empties', () => {
    const order = po(42, '2026-09-18T09:00:00', 900, [{ product_id: 1, qty: 1, empties_given: 1 }])
    expect(purchaseSubtitle(order)).toBe('1 empty given')
  })

  it('never includes the PO number, however long it is', () => {
    const order = po(42, '2026-09-18T09:00:00', 900, [{ product_id: 1, qty: 1, empties_given: 1 }])
    order.po_number = 'PO-20260918-0001'
    expect(purchaseSubtitle(order)).not.toContain('PO-')
  })
})

describe('purchasesInMonth', () => {
  const orders = [
    po(1, '2026-09-18T09:00:00', 54000, [{ product_id: 1, qty: 60 }]),
    po(2, '2026-09-01T00:30:00', 12000, [{ product_id: 1, qty: 12 }]),
    po(3, '2026-08-31T23:30:00', 30000, [{ product_id: 1, qty: 30 }]),
    po(4, '2025-09-15T09:00:00', 9000, [{ product_id: 1, qty: 9 }]),
  ]

  it('keeps only that calendar month', () => {
    expect(purchasesInMonth(orders, 2026, 9).map((o) => o.id)).toEqual([1, 2])
  })

  it('does not bleed across the year boundary for the same month number', () => {
    expect(purchasesInMonth(orders, 2025, 9).map((o) => o.id)).toEqual([4])
  })

  it('takes a 1-based month, so 8 is August', () => {
    expect(purchasesInMonth(orders, 2026, 8).map((o) => o.id)).toEqual([3])
  })

  it('returns nothing for a month with no purchases', () => {
    expect(purchasesInMonth(orders, 2026, 7)).toEqual([])
  })
})

describe('summarisePurchases', () => {
  const orders = [
    po(1, '2026-09-18T09:00:00', 54000, [{ product_id: 1, qty: 60, empties_given: 40 }]),
    po(2, '2026-09-11T09:00:00', 72000, [{ product_id: 1, qty: 80, empties_given: 72 }]),
  ]

  it('totals spend and order count over exactly what it is given', () => {
    const s = summarisePurchases(orders)
    expect(s.spend).toBe(126000)
    expect(s.orderCount).toBe(2)
  })

  it('counts cylinders in and empties out', () => {
    const s = summarisePurchases(orders)
    expect(s.cylindersIn).toBe(140)
    expect(s.emptiesOut).toBe(112)
  })

  it('reports zeros for an empty month', () => {
    expect(summarisePurchases([])).toEqual({
      spend: 0, orderCount: 0, cylindersIn: 0, emptiesOut: 0,
    })
  })
})

describe('groupPurchasesByDay', () => {
  const orders = [
    po(1, '2026-09-18T15:00:00', 54000, [{ product_id: 1, qty: 60 }]),
    po(2, '2026-09-18T09:00:00', 14700, [{ product_id: 2, qty: 18 }]),
    po(3, '2026-09-06T09:00:00', 27300, [{ product_id: 1, qty: 30 }]),
  ]

  it('puts orders from the same day in one group', () => {
    const g = groupPurchasesByDay(orders)
    expect(g).toHaveLength(2)
    expect(g[0].orders.map((o) => o.id)).toEqual([1, 2])
  })

  it('labels each day with its weekday and date', () => {
    const g = groupPurchasesByDay(orders)
    expect(g[0].label).toBe('Fri, 18 Sep')
    expect(g[1].label).toBe('Sun, 06 Sep')
  })

  it('subtotals each day', () => {
    const g = groupPurchasesByDay(orders)
    expect(g[0].subtotal).toBe(68700)
    expect(g[1].subtotal).toBe(27300)
  })

  it('orders days newest first regardless of input order', () => {
    const g = groupPurchasesByDay([orders[2], orders[0], orders[1]])
    expect(g.map((x) => x.label)).toEqual(['Fri, 18 Sep', 'Sun, 06 Sep'])
  })

  it('gives every group a stable unique key', () => {
    const keys = groupPurchasesByDay(orders).map((x) => x.key)
    expect(new Set(keys).size).toBe(keys.length)
  })

  it('returns nothing for no orders', () => {
    expect(groupPurchasesByDay([])).toEqual([])
  })
})
