import { describe, it, expect } from 'vitest'
import {
  templateForBillType,
  buildTemplateParams,
  formatBillDate,
  formatPlainItems,
  formatDeliveredWithPrices,
  formatEmptiesCollected,
  formatPaymentStatus,
  type BillContext,
} from './whatsappTemplates'

const base: BillContext = {
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

describe('formatPlainItems', () => {
  it('joins items on one line with the bullet separator', () => {
    expect(formatPlainItems([
      { productName: '19kg Commercial', qty: 2 },
      { productName: '5kg', qty: 1 },
    ])).toBe('2 × 19kg Commercial • 1 × 5kg')
  })

  it('never emits a newline or tab, whatever the product names contain', () => {
    const out = formatPlainItems([{ productName: '19kg\nCommercial\tA', qty: 2 }])
    expect(out).not.toMatch(/[\n\t]/)
    expect(out).toBe('2 × 19kg Commercial A')
  })

  it('returns a dash for an empty line list', () => {
    expect(formatPlainItems([])).toBe('-')
  })
})

describe('formatDeliveredWithPrices', () => {
  it('renders unit rate and line total, recovered from amount / qty', () => {
    expect(formatDeliveredWithPrices([
      { productName: '19kg Commercial', qty: 2, amount: 4300 },
    ])).toBe('2 × 19kg Commercial @ ₹2150 = ₹4300')
  })

  it('joins multiple lines with the bullet separator', () => {
    expect(formatDeliveredWithPrices([
      { productName: '19kg Commercial', qty: 2, amount: 4300 },
      { productName: '5kg', qty: 1, amount: 450 },
    ])).toBe('2 × 19kg Commercial @ ₹2150 = ₹4300 • 1 × 5kg @ ₹450 = ₹450')
  })

  it('omits the rate/total for a qty-0 line instead of dividing by zero', () => {
    const out = formatDeliveredWithPrices([{ productName: 'Empty Swap', qty: 0, amount: 0 }])
    expect(out).toBe('0 × Empty Swap')
    expect(out).not.toMatch(/NaN|Infinity/)
  })

  it('returns a dash for an empty line list', () => {
    expect(formatDeliveredWithPrices([])).toBe('-')
  })

  it('never emits a newline or tab', () => {
    const out = formatDeliveredWithPrices([{ productName: '19kg\nCommercial', qty: 2, amount: 100 }])
    expect(out).not.toMatch(/[\n\t]/)
  })
})

describe('formatEmptiesCollected', () => {
  it('renders empties with no price', () => {
    expect(formatEmptiesCollected([
      { productName: '19kg Commercial', qty: 2, empties: 2 },
    ])).toBe('2 × 19kg Commercial')
  })

  it('omits lines with zero empties', () => {
    expect(formatEmptiesCollected([
      { productName: '19kg Commercial', qty: 2, empties: 2 },
      { productName: '5kg', qty: 1, empties: 0 },
    ])).toBe('2 × 19kg Commercial')
  })

  it('returns None when no line has empties', () => {
    expect(formatEmptiesCollected([
      { productName: '19kg Commercial', qty: 2, empties: 0 },
    ])).toBe('None')
  })

  it('joins multiple lines with the bullet separator', () => {
    expect(formatEmptiesCollected([
      { productName: '19kg Commercial', qty: 2, empties: 2 },
      { productName: '5kg', qty: 1, empties: 1 },
    ])).toBe('2 × 19kg Commercial • 1 × 5kg')
  })
})

describe('formatPaymentStatus', () => {
  it('renders Paid by <Method> when paid with a method', () => {
    expect(formatPaymentStatus(true, 'cash')).toBe('Paid by Cash')
    expect(formatPaymentStatus(true, 'upi')).toBe('Paid by Upi')
    expect(formatPaymentStatus(true, 'vitran')).toBe('Paid by Vitran')
  })

  it('renders plain Paid when paid with no method recorded', () => {
    expect(formatPaymentStatus(true, null)).toBe('Paid')
  })

  it('renders Not paid when unpaid, regardless of method', () => {
    expect(formatPaymentStatus(false, 'cash')).toBe('Not paid')
    expect(formatPaymentStatus(false, null)).toBe('Not paid')
  })
})

describe('buildTemplateParams', () => {
  it('builds sale params in template order', () => {
    expect(buildTemplateParams('bill_sale', base)).toEqual([
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

  it('renders a multi-line sale with the bullet separator in both item params', () => {
    const out = buildTemplateParams('bill_sale', {
      ...base,
      lines: [
        { productName: '19kg Commercial', qty: 2, amount: 4300, empties: 2 },
        { productName: '5kg', qty: 1, amount: 450, empties: 0 },
      ],
    })
    expect(out[3]).toBe('2 × 19kg Commercial @ ₹2150 = ₹4300 • 1 × 5kg @ ₹450 = ₹450')
    expect(out[4]).toBe('2 × 19kg Commercial')
  })

  it('handles a sale line with qty 0 without dividing by zero', () => {
    const out = buildTemplateParams('bill_sale', {
      ...base,
      lines: [{ productName: 'Empty Swap', qty: 0, amount: 0, empties: 0 }],
    })
    expect(out[3]).toBe('0 × Empty Swap')
    expect(out[3]).not.toMatch(/NaN|Infinity/)
  })

  it('reports None for empties when no line has any', () => {
    const out = buildTemplateParams('bill_sale', {
      ...base,
      lines: [{ productName: '19kg Commercial', qty: 2, amount: 4300, empties: 0 }],
    })
    expect(out[4]).toBe('None')
  })

  it('reports Not paid on an unpaid sale', () => {
    const out = buildTemplateParams('bill_sale', { ...base, paid: false })
    expect(out[6]).toBe('Not paid')
  })

  it('reports plain Paid on a paid sale with no method', () => {
    const out = buildTemplateParams('bill_sale', { ...base, paid: true, method: null })
    expect(out[6]).toBe('Paid')
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

  it('builds return params from line quantities plus balance due', () => {
    expect(buildTemplateParams('bill_return', {
      ...base,
      lines: [{ productName: '19kg Commercial', qty: 3, amount: 0, empties: 0 }],
    })).toEqual([
      'Ramesh Traders', '13-09-2026', '3 × 19kg Commercial', '7', '12500',
    ])
  })

  it('rounds amounts to whole rupees with no separators', () => {
    const out = buildTemplateParams('bill_sale', { ...base, totalAmount: 4300.6, balanceDue: 125000 })
    expect(out[5]).toBe('4301')
    expect(out[8]).toBe('125000')
  })

  it('renders a negative balance (customer in credit) without breaking', () => {
    expect(buildTemplateParams('bill_sale', { ...base, balanceDue: -500 })[8]).toBe('-500')
  })

  it('never emits a parameter containing a newline or tab, for any of the three templates', () => {
    const dirty: BillContext = {
      ...base,
      customerName: 'Bad\nName',
      billNumber: 'S\t1042',
      method: 'ca\nsh',
      lines: [
        { productName: '19kg\nCommercial\tA', qty: 2, amount: 4300, empties: 2 },
        { productName: '5kg\tB', qty: 1, amount: 450, empties: 1 },
      ],
    }
    for (const t of ['bill_sale', 'bill_payment', 'bill_return'] as const) {
      for (const p of buildTemplateParams(t, dirty)) {
        expect(p).not.toMatch(/[\n\t]/)
      }
    }
  })
})
