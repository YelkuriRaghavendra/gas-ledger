import { formatCurrency } from '../../utils/format'

interface PositionCardProps {
  owedToYou: number
  owedToSupplier: number
  stock: number
}

/**
 * Both sides of the ledger. The rest of the app tracks what customers owe the
 * agency and never what the agency owes the supplier, which is half of knowing
 * where the business stands.
 *
 * These are live figures, not the browsed month's — hence "right now" rather
 * than a month name.
 */
export function PositionCard({ owedToYou, owedToSupplier, stock }: PositionCardProps) {
  const net = owedToYou + stock - owedToSupplier

  return (
    <div className="mt-3 rounded-[18px] bg-surface px-[15px] py-[7px] shadow-card">
      <p className="pb-[5px] pt-[7px] text-[13px] font-bold text-muted">Your position right now</p>
      <Line label="Customers owe you" value={formatCurrency(owedToYou)} />
      <Line label="Stock in the godown" value={formatCurrency(stock)} />
      <Line label="You owe the supplier" value={`−${formatCurrency(owedToSupplier)}`} />
      <div className="border-t border-ink/[.12]" />
      <div className="flex items-baseline justify-between py-[10px]">
        <p className="text-[13.5px] font-extrabold text-ink">Net</p>
        <p className={`font-display text-[19px] font-bold tabular-nums ${net < 0 ? 'text-[#A32D2D]' : 'text-ink'}`}>
          {formatCurrency(net)}
        </p>
      </div>
    </div>
  )
}

function Line({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-[8px]">
      <p className="text-[13.5px] font-bold text-ink">{label}</p>
      <p className="font-display text-[15px] font-bold tabular-nums text-ink">{value}</p>
    </div>
  )
}
