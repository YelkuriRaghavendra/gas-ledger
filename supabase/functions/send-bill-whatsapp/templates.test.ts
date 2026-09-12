import { describe, it, expect } from 'vitest'
import { buildTemplateParams, templateForBillType, type BillContext } from './templates'
import { normalizeIndianPhone } from './phone'

const ctx: BillContext = {
  customerName: 'Ramesh Traders',
  billNumber: 'S-1042',
  createdAt: '2026-09-13T06:30:00.000Z',
  totalAmount: 4300,
  method: 'cash',
  lines: [{ productName: '19kg Commercial', qty: 2 }],
  balanceDue: 12500,
  emptiesOutstanding: 7,
}

describe('edge function copies match the src originals', () => {
  it('builds identical sale params', () => {
    expect(buildTemplateParams('bill_sale', ctx)).toEqual([
      'Ramesh Traders', 'S-1042', '13-09-2026', '2 × 19kg Commercial', '4300', '12500',
    ])
  })

  it('maps bill types identically', () => {
    expect(templateForBillType('sale')).toBe('bill_sale')
    expect(templateForBillType('opening')).toBeNull()
  })

  it('normalizes phones identically', () => {
    expect(normalizeIndianPhone('+91 98765-43210')).toBe('919876543210')
    expect(normalizeIndianPhone('1234567890')).toBeNull()
  })
})
