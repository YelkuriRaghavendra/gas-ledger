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
})
