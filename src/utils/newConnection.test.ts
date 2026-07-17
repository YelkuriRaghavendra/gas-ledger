import { describe, it, expect } from 'vitest'
import { countNewConnections } from './newConnection'

const bill = (lines: Array<{ product_id: number | null; qty: number }>) =>
  ({ lines } as any)

describe('countNewConnections', () => {
  it('returns 0 when no combos are flagged', () => {
    expect(countNewConnections([bill([{ product_id: 5, qty: 3 }])], new Set())).toBe(0)
  })

  it('sums qty of flagged-combo lines across bills', () => {
    const bills = [bill([{ product_id: 8, qty: 2 }]), bill([{ product_id: 8, qty: 1 }])]
    expect(countNewConnections(bills, new Set([8]))).toBe(3)
  })

  it('ignores non-flagged and cylinder lines in a mixed bill', () => {
    const bills = [bill([{ product_id: 1, qty: 5 }, { product_id: 8, qty: 1 }])]
    expect(countNewConnections(bills, new Set([8]))).toBe(1)
  })

  it('skips lines with a null product_id', () => {
    const bills = [bill([{ product_id: null, qty: 4 }, { product_id: 8, qty: 2 }])]
    expect(countNewConnections(bills, new Set([8]))).toBe(2)
  })
})
