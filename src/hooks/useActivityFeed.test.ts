import { describe, it, expect, vi } from 'vitest'
vi.mock('../lib/supabase', () => ({ supabase: {} }))
import { normalizeFeedRow } from './useActivityFeed'

describe('normalizeFeedRow', () => {
  it('labels a purchase entry with a Purchase-prefixed title', () => {
    const row = { id: 1, customer_id: null, customer_name: '19 kg', type: 'purchase',
      product_id: 5, product_name: '19 kg', qty: 60, empties: 40, amount: 54000,
      note: null, created_by: null, created_at: 'x', updated_at: 'x', segment: 'commercial' } as any
    const out = normalizeFeedRow(row)
    expect(out.type).toBe('purchase')
    expect(out.title).toContain('Purchase')
  })
  it('keeps a sale entry titled by customer name', () => {
    const row = { id: 2, customer_id: 3, customer_name: 'Taj Kitchen', type: 'sale',
      product_id: 5, product_name: '19 kg', qty: 12, empties: 10, amount: 15600,
      note: null, created_by: null, created_at: 'x', updated_at: 'x', segment: 'commercial' } as any
    expect(normalizeFeedRow(row).title).toBe('Taj Kitchen')
  })
  it('titles a domestic counter bill by bill number and product', () => {
    const row = { id: 4, customer_id: null, customer_name: null, type: 'sale',
      product_id: 7, product_name: '14.2 kg', qty: 406, empties: 404, amount: 406000,
      bill_number: 'D-1042', note: null, created_by: null, created_at: 'x',
      updated_at: 'x', segment: 'domestic' } as any
    expect(normalizeFeedRow(row).title).toBe('D-1042 · 14.2 kg')
  })
  it('falls back to a plain label when a counter bill has no product line', () => {
    const row = { id: 5, customer_id: null, customer_name: null, type: 'return',
      product_id: null, product_name: null, qty: 2, empties: 0, amount: 0,
      bill_number: null, note: null, created_by: null, created_at: 'x',
      updated_at: 'x', segment: 'domestic' } as any
    expect(normalizeFeedRow(row).title).toBe('Counter bill')
  })
})
