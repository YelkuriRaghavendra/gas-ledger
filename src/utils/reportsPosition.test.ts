import { describe, it, expect } from 'vitest'
import { perCylinder, paceThroughDay, agedDebtors, supplierDues, latestRates, stockValue } from './reportsPosition'
import type { SettledBill } from './profit'

function bill(day: string, over: Partial<SettledBill> = {}): SettledBill {
  return {
    bill_id: 1, bill_number: 'B-1', customer_id: 1, created_at: `${day}T10:00:00Z`, day,
    paid: false, qty: 2, revenue_incl: 1180, revenue_ex: 1000, cost_ex: 700, profit: 300,
    gst_in: 126, gst_out: 180, cost_known: true,
    realisedFraction: 0, realisedProfit: 0, pendingProfit: 300,
    ...over,
  } as SettledBill
}

describe('perCylinder', () => {
  it('divides the profit across the cylinders that earned it', () => {
    expect(perCylinder(88000, 284)).toBeCloseTo(309.86, 1)
  })

  it('has nothing to divide when no cylinder moved', () => {
    expect(perCylinder(0, 0)).toBeNull()
  })
})

describe('paceThroughDay', () => {
  const bills = [bill('2026-08-03'), bill('2026-08-14'), bill('2026-08-29')]

  it('counts only what had been earned by the same day of the month', () => {
    expect(paceThroughDay(bills, 14).profit).toBe(600)
  })

  it('counts the whole month once the day has passed its end', () => {
    expect(paceThroughDay(bills, 31).profit).toBe(900)
  })

  it('leaves out a bill with unknown cost, as the headline does', () => {
    const mixed = [bill('2026-08-03'), bill('2026-08-04', { cost_known: false, profit: null })]
    expect(paceThroughDay(mixed, 28).profit).toBe(300)
  })
})

describe('agedDebtors', () => {
  const names = new Map([[1, 'Taj Kitchen'], [2, 'Blue Cafe']])

  it('ages a customer from their oldest bill that is not fully settled', () => {
    const rows = agedDebtors(
      [bill('2026-07-16', { customer_id: 1 }), bill('2026-09-20', { bill_id: 2, customer_id: 1 })],
      names,
      '2026-09-28',
    )
    expect(rows[0].oldestDays).toBe(74)
  })

  it('adds up everything the customer still owes', () => {
    const rows = agedDebtors(
      [
        bill('2026-09-01', { customer_id: 1, revenue_incl: 1000, realisedFraction: 0 }),
        bill('2026-09-02', { bill_id: 2, customer_id: 1, revenue_incl: 2000, realisedFraction: 0.5 }),
      ],
      names,
      '2026-09-28',
    )
    expect(rows[0].due).toBe(2000)
  })

  it('leaves out a customer who has paid up', () => {
    expect(agedDebtors([bill('2026-09-01', { paid: true })], names, '2026-09-28')).toEqual([])
  })

  it('puts the oldest debt first, not the largest', () => {
    const rows = agedDebtors(
      [
        bill('2026-09-20', { customer_id: 1, revenue_incl: 90000 }),
        bill('2026-06-01', { bill_id: 2, customer_id: 2, revenue_incl: 500 }),
      ],
      names,
      '2026-09-28',
    )
    expect(rows.map((r) => r.name)).toEqual(['Blue Cafe', 'Taj Kitchen'])
  })
})

describe('supplierDues', () => {
  it('adds up the purchase orders that have not been paid for', () => {
    expect(
      supplierDues([
        { total_amount: 50000, paid: false },
        { total_amount: 40000, paid: false },
        { total_amount: 90000, paid: true },
      ]),
    ).toBe(90000)
  })
})

describe('latestRates', () => {
  it('takes the rate from the most recent purchase of that product', () => {
    const rates = latestRates([
      { created_at: '2026-08-01T00:00:00Z', purchase_lines: [{ product_id: 5, qty: 10, amount: 8000 }] },
      { created_at: '2026-09-01T00:00:00Z', purchase_lines: [{ product_id: 5, qty: 10, amount: 9000 }] },
    ])
    expect(rates.get(5)).toBe(900)
  })

  it('ignores a line that bought nothing, which would divide by zero', () => {
    const rates = latestRates([
      { created_at: '2026-09-01T00:00:00Z', purchase_lines: [{ product_id: 5, qty: 0, amount: 0 }] },
    ])
    expect(rates.has(5)).toBe(false)
  })
})

describe('stockValue', () => {
  it('values full cylinders at what they last cost', () => {
    expect(stockValue([{ product_id: 5, full_cylinders: 12 }], new Map([[5, 900]]))).toBe(10800)
  })

  it('skips a product that has never been bought, having no rate to use', () => {
    expect(stockValue([{ product_id: 9, full_cylinders: 12 }], new Map())).toBe(0)
  })
})
