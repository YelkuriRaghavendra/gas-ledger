import { describe, it, expect } from 'vitest'
import {
  templateForBillType,
  buildTemplateParams,
  formatBillDate,
  formatItems,
  type BillContext,
} from './whatsappTemplates'

const base: BillContext = {
  customerName: 'Ramesh Traders',
  billNumber: 'S-1042',
  createdAt: '2026-09-13T06:30:00.000Z',
  totalAmount: 4300,
  method: 'cash',
  lines: [{ productName: '19kg Commercial', qty: 2 }],
  balanceDue: 12500,
  emptiesOutstanding: 7,
}

describe('templateForBillType', () => {
  it('maps the three sending bill types', () => {
    expect(templateForBillType('sale')).toBe('bill_sale')
    expect(templateForBillType('payment')).toBe('bill_payment')
    expect(templateForBillType('return')).toBe('bill_return')
  })

  it('returns null for opening bills, which must never send', () => {
    expect(templateForBillType('opening')).toBeNull()
  })

  it('returns null for an unknown type', () => {
    expect(templateForBillType('something_else')).toBeNull()
  })
})

describe('formatBillDate', () => {
  it('formats as DD-MM-YYYY in IST', () => {
    expect(formatBillDate('2026-09-13T06:30:00.000Z')).toBe('13-09-2026')
  })

  it('rolls to the next IST day for a late-evening UTC timestamp', () => {
    // 19:00 UTC on the 13th is 00:30 IST on the 14th.
    expect(formatBillDate('2026-09-13T19:00:00.000Z')).toBe('14-09-2026')
  })
})

describe('formatItems', () => {
  it('joins items on one line', () => {
    expect(formatItems([
      { productName: '19kg Commercial', qty: 2 },
      { productName: '5kg', qty: 1 },
    ])).toBe('2 × 19kg Commercial, 1 × 5kg')
  })

  it('never emits a newline or tab, whatever the product names contain', () => {
    const out = formatItems([{ productName: '19kg\nCommercial\tA', qty: 2 }])
    expect(out).not.toMatch(/[\n\t]/)
    expect(out).toBe('2 × 19kg Commercial A')
  })

  it('returns a dash for an empty line list', () => {
    expect(formatItems([])).toBe('-')
  })
})

describe('buildTemplateParams', () => {
  it('builds sale params in template order', () => {
    expect(buildTemplateParams('bill_sale', base)).toEqual([
      'Ramesh Traders', 'S-1042', '13-09-2026', '2 × 19kg Commercial', '4300', '12500',
    ])
  })

  it('builds payment params with a title-cased method', () => {
    expect(buildTemplateParams('bill_payment', { ...base, method: 'upi' })).toEqual([
      'Ramesh Traders', '4300', '13-09-2026', 'Upi', '12500',
    ])
  })

  it('falls back to Cash when a payment has no method recorded', () => {
    expect(buildTemplateParams('bill_payment', { ...base, method: null })[3]).toBe('Cash')
  })

  it('never emits a newline or tab from a method containing embedded whitespace', () => {
    const out = buildTemplateParams('bill_payment', { ...base, method: 'g\npay' })
    for (const p of out) {
      expect(p).not.toMatch(/[\n\t]/)
    }
    expect(out[3]).toBe('G pay')
  })

  it('builds return params from line quantities', () => {
    expect(buildTemplateParams('bill_return', {
      ...base,
      lines: [{ productName: '19kg Commercial', qty: 3 }],
    })).toEqual([
      'Ramesh Traders', '13-09-2026', '3 × 19kg Commercial', '7',
    ])
  })

  it('rounds amounts to whole rupees with no separators', () => {
    const out = buildTemplateParams('bill_sale', { ...base, totalAmount: 4300.6, balanceDue: 125000 })
    expect(out[4]).toBe('4301')
    expect(out[5]).toBe('125000')
  })

  it('renders a negative balance (customer in credit) without breaking', () => {
    expect(buildTemplateParams('bill_sale', { ...base, balanceDue: -500 })[5]).toBe('-500')
  })

  it('never emits a parameter containing a newline', () => {
    for (const t of ['bill_sale', 'bill_payment', 'bill_return'] as const) {
      for (const p of buildTemplateParams(t, { ...base, customerName: 'Bad\nName' })) {
        expect(p).not.toMatch(/[\n\t]/)
      }
    }
  })
})
