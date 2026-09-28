import { formatCurrency } from '../../utils/format'
import type { Mover } from '../../utils/reportsTrend'

interface MoversListProps {
  title: string
  risers: Mover[]
  fallers: Mover[]
  againstLabel: string
}

/**
 * What changed since last month, both directions. Ranked by rupees rather than
 * percentage, so the list answers "who do I call" rather than "who doubled a
 * small number".
 */
export function MoversList({ title, risers, fallers, againstLabel }: MoversListProps) {
  if (risers.length === 0 && fallers.length === 0) return null

  return (
    <div className="mt-3 rounded-[16px] bg-surface p-3 shadow-card">
      <div className="mb-[10px] flex items-baseline justify-between">
        <p className="text-[10px] font-bold uppercase tracking-[0.5px] text-muted">{title}</p>
        <p className="text-[10px] font-bold uppercase tracking-[0.5px] text-subtle">vs {againstLabel}</p>
      </div>

      <Side movers={risers} />
      {risers.length > 0 && fallers.length > 0 && <div className="my-[6px] border-t border-borderMuted" />}
      <Side movers={fallers} />
    </div>
  )
}

function Side({ movers }: { movers: Mover[] }) {
  return (
    <>
      {movers.map((mover) => {
        const up = mover.change > 0
        return (
          <div key={mover.id} className="flex items-center justify-between py-[7px]">
            <div className="min-w-0 flex-1 pr-3">
              <p className="truncate text-[13px] font-bold text-ink">{mover.name}</p>
              <p className="mt-[1px] text-[11px] font-semibold text-subtle">
                {formatCurrency(mover.previous)} → {formatCurrency(mover.current)}
              </p>
            </div>
            <p className={`shrink-0 text-[13px] font-bold ${up ? 'text-[#1D9E75]' : 'text-[#A32D2D]'}`}>
              {up ? '+' : '−'}
              {formatCurrency(Math.abs(mover.change))}
              {mover.pctChange != null && (
                <span className="ml-[5px] text-[10.5px] font-semibold text-subtle">
                  {mover.pctChange > 0 ? '↑' : '↓'} {Math.abs(mover.pctChange).toFixed(0)}%
                </span>
              )}
            </p>
          </div>
        )
      })}
    </>
  )
}
