import { Link } from 'react-router-dom'
import { formatCurrency } from '../../utils/format'
import { pctChange } from '../../utils/reportsTrend'

export interface BreakdownRow {
  id: number
  name: string
  qty: number
  profit: number
  previousProfit: number | null
  /** Shown on the right of the second line — a due figure, a unit, anything. */
  note?: string
  noteTone?: 'warn' | 'good'
  to?: string
}

/**
 * Where the profit came from, with each row carrying its own movement since
 * last month. The movement lives here rather than in a separate "movers" card
 * so the same product is never listed twice on one screen.
 */
export function BreakdownList({
  title,
  rows,
  empty,
  unit,
}: {
  title: string
  rows: BreakdownRow[]
  empty: string
  unit: string
}) {
  return (
    <section className="mt-5">
      <h2 className="mb-[9px] px-1 text-[15px] font-bold tracking-[-0.2px] text-ink">{title}</h2>
      <div className="rounded-[18px] bg-surface px-[15px] shadow-card">
        {rows.length === 0 && <p className="py-5 text-center text-[13px] font-semibold text-subtle">{empty}</p>}
        {rows.map((row, i) => {
          const change = row.previousProfit != null ? pctChange(row.profit, row.previousProfit) : null
          const body = (
            <>
              <div className="min-w-0 flex-1 pr-3">
                <p className="truncate text-[13.5px] font-bold text-ink">{row.name}</p>
                <p className="mt-[2px] text-[11.5px] font-semibold text-subtle">
                  {row.qty} {unit}
                  {row.note && (
                    <span className={row.noteTone === 'warn' ? 'text-[#A32D2D]' : row.noteTone === 'good' ? 'text-[#1D9E75]' : ''}>
                      {' · '}
                      {row.note}
                    </span>
                  )}
                </p>
              </div>
              <div className="shrink-0 text-right">
                <p className="font-display text-[15px] font-bold tabular-nums text-ink">{formatCurrency(row.profit)}</p>
                {change != null && change !== 0 && (
                  <p className={`mt-[2px] text-[11px] font-bold ${change > 0 ? 'text-[#1D9E75]' : 'text-[#A32D2D]'}`}>
                    {change > 0 ? '↑' : '↓'}
                    {Math.abs(change).toFixed(0)}%
                  </p>
                )}
              </div>
            </>
          )

          const className = `flex items-center justify-between py-[11px] ${
            i < rows.length - 1 ? 'border-b border-borderMuted' : ''
          }`

          return row.to ? (
            <Link key={row.id} to={row.to} className={className}>
              {body}
            </Link>
          ) : (
            <div key={row.id} className={className}>
              {body}
            </div>
          )
        })}
      </div>
    </section>
  )
}
