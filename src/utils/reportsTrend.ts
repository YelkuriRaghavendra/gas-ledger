import type { SettledBill } from './profit'

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

export interface MonthKey {
  /** `YYYY-MM`, the prefix of the views' IST `day` column. */
  key: string
  year: number
  month: number
  /** Axis label — short, because twelve of them share a phone's width. */
  label: string
  fullLabel: string
}

/** The `count` months ending at (and including) the one given, oldest first. */
export function monthWindow(year: number, month: number, count = 12): MonthKey[] {
  const out: MonthKey[] = []
  for (let back = count - 1; back >= 0; back--) {
    const d = new Date(year, month - 1 - back, 1)
    const y = d.getFullYear()
    const m = d.getMonth() + 1
    out.push({
      key: `${y}-${String(m).padStart(2, '0')}`,
      year: y,
      month: m,
      label: MONTHS[m - 1],
      fullLabel: `${MONTHS[m - 1]} ${y}`,
    })
  }
  return out
}

/**
 * Change from `previous` to `current`, as a percentage of `previous`. Null when
 * there is nothing meaningful to divide by: a zero baseline makes any rise
 * infinite, and a negative one flips the sign, so a loss turning into a smaller
 * loss would read as a fall.
 */
export function pctChange(current: number, previous: number): number | null {
  if (previous <= 0) return null
  return ((current - previous) / previous) * 100
}

/**
 * Folds rows from the `daily_*_summary` views into one total per month of the
 * window, in window order. The views are one row per day (per product, for the
 * product ones), so every caller would otherwise write this same loop.
 */
export function sumByMonth<T extends { day: string }>(
  rows: T[],
  window: MonthKey[],
  value: (row: T) => number,
): number[] {
  const totals = new Map(window.map((m) => [m.key, 0]))
  for (const row of rows) {
    const key = row.day.slice(0, 7)
    if (!totals.has(key)) continue
    totals.set(key, totals.get(key)! + value(row))
  }
  return [...totals.values()]
}

export interface MoverInput {
  id: number
  name: string
  value: number
}

export interface Mover extends MoverInput {
  current: number
  previous: number
  change: number
  pctChange: number | null
}

/**
 * What moved between two periods, biggest movement first on each side.
 *
 * Ranked by absolute change rather than percentage: a customer going from ₹200
 * to ₹400 doubles, but a customer losing ₹40,000 is the one worth a phone call.
 * Names are carried from whichever period has them, so someone who stopped
 * buying entirely still appears — that disappearance is the point. Equal
 * movements break by name, because the ids come out of a Set and would
 * otherwise reorder the list between loads of the same data.
 */
export function rankMovers(
  current: MoverInput[],
  previous: MoverInput[],
  limit = 3,
): { risers: Mover[]; fallers: Mover[] } {
  const nowById = new Map(current.map((r) => [r.id, r]))
  const thenById = new Map(previous.map((r) => [r.id, r]))

  const movers: Mover[] = []
  for (const id of new Set([...nowById.keys(), ...thenById.keys()])) {
    const now = nowById.get(id)
    const then = thenById.get(id)
    const currentValue = now?.value ?? 0
    const previousValue = then?.value ?? 0
    const change = currentValue - previousValue
    if (change === 0) continue
    movers.push({
      id,
      name: now?.name ?? then?.name ?? `#${id}`,
      value: currentValue,
      current: currentValue,
      previous: previousValue,
      change,
      pctChange: pctChange(currentValue, previousValue),
    })
  }

  return {
    risers: movers
      .filter((m) => m.change > 0)
      .sort((a, b) => b.change - a.change || a.name.localeCompare(b.name))
      .slice(0, limit),
    fallers: movers
      .filter((m) => m.change < 0)
      .sort((a, b) => a.change - b.change || a.name.localeCompare(b.name))
      .slice(0, limit),
  }
}

/**
 * Money still owed on the bills given, GST included — the customer-facing
 * figure, not the ex-GST revenue the profit maths uses.
 *
 * Counter-paid bills are settled by definition. A credit bill counts only the
 * share no payment has reached yet, using the same oldest-first realisation the
 * profit screen already applies, so this agrees with the realised/pending split
 * above it rather than offering a second opinion.
 */
export function unpaidFrom(bills: SettledBill[]): number {
  return bills.reduce(
    (sum, b) => (b.paid ? sum : sum + b.revenue_incl * (1 - b.realisedFraction)),
    0,
  )
}
