import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { buildTemplateParams, templateForBillType, type BillContext } from './templates'
import { normalizeIndianPhone } from './phone'

const ctx: BillContext = {
  customerName: 'Ramesh Traders',
  billNumber: 'S-1042',
  createdAt: '2026-09-13T06:30:00.000Z',
  totalAmount: 4300,
  method: 'cash',
  paid: true,
  lines: [{ productName: '19kg Commercial', qty: 2, amount: 4300, empties: 2 }],
  balanceDue: 12500,
  emptiesOutstanding: 7,
}

describe('edge function copies match the src originals', () => {
  it('templates.ts is byte-identical to src/utils/whatsappTemplates.ts', () => {
    expect(readFileSync('supabase/functions/send-bill-whatsapp/templates.ts', 'utf8'))
      .toBe(readFileSync('src/utils/whatsappTemplates.ts', 'utf8'))
  })

  it('phone.ts is byte-identical to src/utils/phone.ts', () => {
    expect(readFileSync('supabase/functions/send-bill-whatsapp/phone.ts', 'utf8'))
      .toBe(readFileSync('src/utils/phone.ts', 'utf8'))
  })

  it('builds identical sale params', () => {
    expect(buildTemplateParams('bill_sale', ctx)).toEqual([
      'Ramesh Traders',
      'S-1042',
      '13-09-2026',
      '2 × 19kg Commercial @ ₹2150 = ₹4300',
      '2 × 19kg Commercial',
      '4300',
      'Paid by Cash',
      '7',
      '12500',
    ])
  })

  it('builds identical payment params', () => {
    expect(buildTemplateParams('bill_payment', ctx)).toEqual([
      'Ramesh Traders', '4300', '13-09-2026', 'Cash', '12500',
    ])
  })

  it('builds identical return params', () => {
    expect(buildTemplateParams('bill_return', ctx)).toEqual([
      'Ramesh Traders', '13-09-2026', '2 × 19kg Commercial', '7', '12500',
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
