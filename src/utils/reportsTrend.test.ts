import { describe, it, expect } from 'vitest'
import { monthWindow, profitTrend, pctChange, sumByMonth, rankMovers, unpaidFrom } from './reportsTrend'
import type { SettledBill } from './profit'

function bill(day: string, over: Partial<SettledBill> = {}): SettledBill {
  return {
    bill_id: 1, bill_number: 'B-1', customer_id: 1, created_at: `${day}T10:00:00Z`, day,
    paid: true, qty: 2, revenue_incl: 1180, revenue_ex: 1000, cost_ex: 700, profit: 300,
    gst_in: 126, gst_out: 180, cost_known: true,
    realisedFraction: 1, realisedProfit: 300, pendingProfit: 0,
    ...over,
  } as SettledBill
}

describe('monthWindow', () => {
  it('ends at the selected month and runs back the requested count', () => {
    const w = monthWindow(2026, 9, 3)
    expect(w.map((m) => m.key)).toEqual(['2026-07', '2026-08', '2026-09'])
  })

  it('crosses the year boundary backwards', () => {
    const w = monthWindow(2026, 2, 4)
    expect(w.map((m) => m.key)).toEqual(['2025-11', '2025-12', '2026-01', '2026-02'])
  })

  it('labels a month by name, and spells out a year that is not the last one', () => {
    const w = monthWindow(2026, 1, 2)
    expect(w.map((m) => m.label)).toEqual(['Dec', 'Jan'])
    expect(w.map((m) => m.fullLabel)).toEqual(['Dec 2025', 'Jan 2026'])
  })
})

describe('profitTrend', () => {
  it('buckets bills into the window by their IST day', () => {
    const points = profitTrend([bill('2026-08-14'), bill('2026-09-02'), bill('2026-09-27')], monthWindow(2026, 9, 2))
    expect(points.map((p) => p.profit)).toEqual([300, 600])
    expect(points.map((p) => p.qty)).toEqual([2, 4])
  })

  it('reports an empty month as zero rather than dropping it', () => {
    const points = profitTrend([bill('2026-09-02')], monthWindow(2026, 9, 3))
    expect(points.map((p) => p.profit)).toEqual([0, 0, 300])
  })

  it('ignores bills outside the window', () => {
    const points = profitTrend([bill('2026-01-05'), bill('2026-09-05')], monthWindow(2026, 9, 2))
    expect(points.map((p) => p.profit)).toEqual([0, 300])
  })

  it('counts an uncosted bill as revenue but not as profit', () => {
    const points = profitTrend(
      [bill('2026-09-05', { cost_known: false, profit: null, cost_ex: null })],
      monthWindow(2026, 9, 1),
    )
    expect(points[0].revenue).toBe(1000)
    expect(points[0].profit).toBe(0)
  })
})

describe('pctChange', () => {
  it('reports the change as a percentage of the earlier figure', () => {
    expect(pctChange(120, 100)).toBe(20)
    expect(pctChange(80, 100)).toBe(-20)
  })

  it('has no baseline to divide by when the earlier figure is zero', () => {
    expect(pctChange(500, 0)).toBeNull()
  })

  it('refuses a negative baseline, where a percentage would invert the sign', () => {
    expect(pctChange(100, -50)).toBeNull()
  })
})

describe('sumByMonth', () => {
  const rows = [
    { day: '2026-08-03', cylinders_sold: 4 },
    { day: '2026-08-29', cylinders_sold: 6 },
    { day: '2026-09-01', cylinders_sold: 5 },
    { day: '2025-12-31', cylinders_sold: 99 },
  ]

  it('folds daily rows into the window, one total per month', () => {
    expect(sumByMonth(rows, monthWindow(2026, 9, 2), (r) => r.cylinders_sold)).toEqual([10, 5])
  })

  it('leaves a month with no rows at zero and drops rows outside the window', () => {
    expect(sumByMonth(rows, monthWindow(2026, 9, 3), (r) => r.cylinders_sold)).toEqual([0, 10, 5])
  })
})

describe('rankMovers', () => {
  const current = [
    { id: 1, name: 'Taj Kitchen', value: 700 },
    { id: 2, name: 'Blue Cafe', value: 200 },
    { id: 3, name: 'New Dhaba', value: 400 },
  ]
  const previous = [
    { id: 1, name: 'Taj Kitchen', value: 500 },
    { id: 2, name: 'Blue Cafe', value: 800 },
    { id: 4, name: 'Old Mess', value: 300 },
  ]

  it('ranks the biggest rise first', () => {
    const { risers } = rankMovers(current, previous)
    expect(risers.map((m) => m.name)).toEqual(['New Dhaba', 'Taj Kitchen'])
    expect(risers[0].change).toBe(400)
  })

  it('ranks the biggest fall first', () => {
    const { fallers } = rankMovers(current, previous)
    expect(fallers.map((m) => m.name)).toEqual(['Blue Cafe', 'Old Mess'])
    expect(fallers[0].change).toBe(-600)
  })

  it('treats someone who stopped buying as a fall to zero, keeping their name', () => {
    const { fallers } = rankMovers(current, previous)
    const gone = fallers.find((m) => m.id === 4)!
    expect(gone.current).toBe(0)
    expect(gone.change).toBe(-300)
  })

  it('gives a newcomer no percentage, having nothing to compare against', () => {
    const { risers } = rankMovers(current, previous)
    expect(risers.find((m) => m.id === 3)!.pctChange).toBeNull()
  })

  it('leaves out anyone who did not move', () => {
    const flat = [{ id: 1, name: 'Taj Kitchen', value: 500 }]
    const { risers, fallers } = rankMovers(flat, flat)
    expect(risers).toEqual([])
    expect(fallers).toEqual([])
  })

  it('breaks a tie by name, so the same data always ranks the same way', () => {
    const { risers } = rankMovers(
      [{ id: 7, name: 'Zenith', value: 100 }, { id: 8, name: 'Apex', value: 100 }],
      [{ id: 7, name: 'Zenith', value: 0 }, { id: 8, name: 'Apex', value: 0 }],
    )
    expect(risers.map((m) => m.name)).toEqual(['Apex', 'Zenith'])
  })

  it('returns at most the requested number on each side', () => {
    const { risers } = rankMovers(current, previous, 1)
    expect(risers).toHaveLength(1)
    expect(risers[0].name).toBe('New Dhaba')
  })
})

describe('unpaidFrom', () => {
  it('ignores a bill settled at the counter', () => {
    expect(unpaidFrom([bill('2026-09-01', { paid: true })])).toBe(0)
  })

  it('counts the whole bill when no payment has reached it', () => {
    expect(unpaidFrom([bill('2026-09-01', { paid: false, realisedFraction: 0 })])).toBe(1180)
  })

  it('counts only the part a later payment has not covered', () => {
    expect(unpaidFrom([bill('2026-09-01', { paid: false, realisedFraction: 0.25 })])).toBe(885)
  })
})
