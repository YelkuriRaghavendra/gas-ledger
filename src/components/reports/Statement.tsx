import { formatCurrency } from '../../utils/format'
import { pctChange } from '../../utils/reportsTrend'

interface StatementProps {
  revenue: number
  cost: number
  profit: number
  gstPayable: number
  previous: { revenue: number; cost: number; profit: number }
  againstLabel: string
}

/**
 * The month as arithmetic rather than three separate tiles. Figures share one
 * right-hand column so the subtraction can be read down the page; the rule
 * above the total does the work three card borders were doing.
 */
export function Statement({ revenue, cost, profit, gstPayable, previous, againstLabel }: StatementProps) {
  return (
    <div className="mt-3 rounded-[18px] bg-surface px-[15px] py-[7px] shadow-card">
      <Row label="Revenue" value={formatCurrency(revenue)} current={revenue} previous={previous.revenue} against={againstLabel} />
      <Row
        label="Cost of cylinders"
        value={`−${formatCurrency(cost)}`}
        current={cost}
        previous={previous.cost}
        against={againstLabel}
        lowerIsBetter
      />
      <div className="border-t border-ink/[.12]" />
      <Row
        label="Gross profit"
        value={formatCurrency(profit)}
        current={profit}
        previous={previous.profit}
        against={againstLabel}
        strong
      />
      <Row label="GST payable" value={formatCurrency(gstPayable)} muted />
    </div>
  )
}

interface RowProps {
  label: string
  value: string
  current?: number
  previous?: number
  against?: string
  strong?: boolean
  muted?: boolean
  lowerIsBetter?: boolean
}

function Row({ label, value, current, previous, against, strong, muted, lowerIsBetter }: RowProps) {
  const change = current != null && previous != null ? pctChange(current, previous) : null
  const rose = change != null && change > 0
  const good = change != null && change !== 0 && rose !== Boolean(lowerIsBetter)

  return (
    <div className="flex items-baseline justify-between gap-3 py-[9px]">
      <div className="min-w-0">
        <p className={`text-[13.5px] ${strong ? 'font-extrabold text-ink' : muted ? 'font-semibold text-muted' : 'font-bold text-ink'}`}>
          {label}
        </p>
        {change != null && change !== 0 && (
          <p className={`mt-[2px] text-[11px] font-bold ${good ? 'text-[#1D9E75]' : 'text-[#A32D2D]'}`}>
            {rose ? '↑' : '↓'}
            {Math.abs(change).toFixed(0)}%
            <span className="font-semibold text-subtle"> vs {against}</span>
          </p>
        )}
      </div>
      <p
        className={`shrink-0 font-display tabular-nums ${
          strong ? 'text-[19px] font-bold text-ink' : muted ? 'text-[14px] font-semibold text-muted' : 'text-[15px] font-bold text-ink'
        }`}
      >
        {value}
      </p>
    </div>
  )
}
