import { pctChange } from '../../utils/reportsTrend'

interface StatTileProps {
  label: string
  value: string
  /** Raw figures behind the value, used only for the change line. */
  current?: number
  previous?: number
  /** Month the comparison is against, e.g. `Aug`. */
  againstLabel?: string
  /** True when a fall is the good outcome — cost, spend, money owed. */
  lowerIsBetter?: boolean
}

/**
 * A single figure with its month-on-month change. The change line is omitted
 * rather than faked when the earlier month has nothing to divide by, so a first
 * month of trading does not claim an infinite rise.
 */
export function StatTile({ label, value, current, previous, againstLabel, lowerIsBetter }: StatTileProps) {
  const change =
    current != null && previous != null ? pctChange(current, previous) : null
  const rose = change != null && change > 0
  const good = change == null || change === 0 ? false : rose !== Boolean(lowerIsBetter)

  return (
    <div className="rounded-[12px] bg-surface px-3 py-[11px] shadow-card">
      <p className="text-[10px] font-bold uppercase tracking-[0.4px] text-muted">{label}</p>
      <p className="mt-[2px] font-display text-[15px] font-bold text-ink">{value}</p>
      {change != null && change !== 0 && (
        <p className={`mt-[3px] text-[10px] font-bold ${good ? 'text-[#1D9E75]' : 'text-[#A32D2D]'}`}>
          {rose ? '↑' : '↓'} {Math.abs(change).toFixed(0)}%
          {againstLabel && <span className="font-semibold text-subtle"> vs {againstLabel}</span>}
        </p>
      )}
    </div>
  )
}
