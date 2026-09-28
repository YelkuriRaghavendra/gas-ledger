import { formatCurrency } from '../../utils/format'
import type { TrendPoint } from '../../utils/reportsTrend'

interface TrendChartProps {
  points: TrendPoint[]
  /** Key of the month the page is showing; its bar reads as selected. */
  selectedKey: string
  onSelect: (point: TrendPoint) => void
}

const HEIGHT = 96
const MIN_BAR = 3

/**
 * Twelve months of gross profit as bars, drawn by hand — the project carries no
 * chart library and one would outweigh this screen.
 *
 * Bars are scaled against the largest month rather than a fixed rupee axis, so
 * the shape of the year is always legible whatever the business is turning over.
 * A loss-making month draws nothing rather than an inverted bar; the number
 * below the chart stays the honest record.
 */
export function TrendChart({ points, selectedKey, onSelect }: TrendChartProps) {
  const peak = Math.max(...points.map((p) => p.profit), 0)

  return (
    <div className="mt-3 rounded-[16px] bg-surface p-3 shadow-card">
      <div className="mb-[10px] flex items-baseline justify-between">
        <p className="text-[10px] font-bold uppercase tracking-[0.5px] text-muted">Profit, last 12 months</p>
        <p className="text-[10px] font-bold uppercase tracking-[0.5px] text-subtle">Peak {formatCurrency(peak)}</p>
      </div>

      <div className="flex items-end gap-[3px]" style={{ height: HEIGHT }}>
        {points.map((point) => {
          const selected = point.key === selectedKey
          const height = peak > 0 ? Math.max((point.profit / peak) * HEIGHT, point.profit > 0 ? MIN_BAR : 0) : 0
          return (
            <button
              key={point.key}
              type="button"
              onClick={() => onSelect(point)}
              aria-label={`${point.fullLabel}: ${formatCurrency(point.profit)}`}
              aria-pressed={selected}
              className="group flex h-full flex-1 flex-col justify-end transition active:scale-95"
            >
              <span
                className={`w-full rounded-t-[4px] transition-colors ${
                  selected ? 'bg-accent' : 'bg-[#E6DED1] group-hover:bg-[#D8CDBC]'
                }`}
                style={{ height: Math.max(height, 2) }}
              />
            </button>
          )
        })}
      </div>

      {/* Twelve three-letter labels do not fit a phone, and initials alone put
          three Js on one axis. Every third month is named; the selected month is
          always named, wherever it falls. */}
      <div className="mt-[6px] flex gap-[3px]">
        {points.map((point, i) => {
          const selected = point.key === selectedKey
          const named = selected || (points.length - 1 - i) % 3 === 0
          return (
            <span
              key={point.key}
              className={`flex-1 text-center text-[8.5px] font-bold ${
                selected ? 'text-ink' : 'text-subtle'
              }`}
            >
              {named ? point.label : '·'}
            </span>
          )
        })}
      </div>
    </div>
  )
}
