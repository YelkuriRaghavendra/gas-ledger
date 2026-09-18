import { describe, it, expect } from 'vitest'
import { periodRangeLabel } from './statement'

// A fixed "today" so the relative periods are deterministic. 13 Sep 2026.
const TODAY = new Date(2026, 8, 13)

describe('periodRangeLabel', () => {
  it('renders this month from the 1st to today', () => {
    expect(periodRangeLabel('this-month', undefined, undefined, TODAY)).toBe('01–13 Sep 2026')
  })

  it('renders last month as its full span', () => {
    expect(periodRangeLabel('last-month', undefined, undefined, TODAY)).toBe('01–31 Aug 2026')
  })

  it('names all time rather than inventing dates', () => {
    expect(periodRangeLabel('all', undefined, undefined, TODAY)).toBe('All time')
  })

  it('renders a custom range within one month without repeating the month', () => {
    expect(periodRangeLabel('custom', '2026-09-04', '2026-09-11', TODAY)).toBe('04–11 Sep 2026')
  })

  it('spells out both months when a custom range spans two', () => {
    expect(periodRangeLabel('custom', '2026-08-28', '2026-09-04', TODAY)).toBe('28 Aug – 04 Sep 2026')
  })

  it('includes both years when a custom range crosses new year', () => {
    expect(periodRangeLabel('custom', '2025-12-28', '2026-01-04', TODAY)).toBe('28 Dec 2025 – 04 Jan 2026')
  })

  it('falls back to All time when a custom range is incomplete', () => {
    expect(periodRangeLabel('custom', '2026-09-04', undefined, TODAY)).toBe('All time')
    expect(periodRangeLabel('custom', undefined, undefined, TODAY)).toBe('All time')
  })

  it('handles a single-day custom range', () => {
    expect(periodRangeLabel('custom', '2026-09-04', '2026-09-04', TODAY)).toBe('04–04 Sep 2026')
  })

  it('handles last month when today is in January', () => {
    const jan = new Date(2026, 0, 9)
    expect(periodRangeLabel('last-month', undefined, undefined, jan)).toBe('01–31 Dec 2025')
  })

  it('handles February in a leap year', () => {
    const mar = new Date(2028, 2, 5)
    expect(periodRangeLabel('last-month', undefined, undefined, mar)).toBe('01–29 Feb 2028')
  })
})
