import { formatCurrency } from '../../utils/format'

interface CashBarProps {
  collected: number
  unpaid: number
  cylindersSold: number
  cylindersBought: number
  emptiesIn: number
  emptiesOut: number
}

/**
 * How much of the month's trade turned into money, as a proportion rather than
 * two numbers to compare in your head. The cylinder line rides along underneath
 * because it answers the same question from the stock side.
 */
export function CashBar({ collected, unpaid, cylindersSold, cylindersBought, emptiesIn, emptiesOut }: CashBarProps) {
  const total = collected + unpaid
  const collectedShare = total > 0 ? (collected / total) * 100 : 0
  const emptiesGap = emptiesOut - emptiesIn

  return (
    <div className="mt-3 rounded-[18px] bg-surface px-[15px] py-[13px] shadow-card">
      <div className="flex items-baseline justify-between">
        <p className="text-[13px] font-bold text-muted">Cash this month</p>
        <p className="font-display text-[13px] font-bold tabular-nums text-ink">
          {total > 0 ? `${Math.round(collectedShare)}% in` : 'Nothing billed'}
        </p>
      </div>

      <div className="mt-[10px] flex h-[9px] overflow-hidden rounded-full bg-[#F0E9DD]">
        <div className="bg-accent" style={{ width: `${collectedShare}%` }} />
      </div>

      <div className="mt-[9px] flex items-baseline justify-between text-[12px] font-semibold">
        <p className="text-muted">
          <span className="font-display font-bold text-ink">{formatCurrency(collected)}</span> collected
        </p>
        <p className="text-muted">
          <span className="font-display font-bold text-ink">{formatCurrency(unpaid)}</span> still owed
        </p>
      </div>

      <p className="mt-[11px] border-t border-borderMuted pt-[10px] text-[12.5px] font-semibold text-muted">
        <span className="font-display font-bold text-ink">{cylindersSold}</span> sold ·{' '}
        <span className="font-display font-bold text-ink">{cylindersBought}</span> bought ·{' '}
        <span className="font-display font-bold text-ink">{Math.abs(emptiesGap)}</span>{' '}
        {emptiesGap > 0 ? 'empties short' : 'empties spare'}
      </p>
    </div>
  )
}
