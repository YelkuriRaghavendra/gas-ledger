import { Link } from 'react-router-dom'
import { formatCurrency } from '../../utils/format'
import type { Debtor } from '../../utils/reportsPosition'

/**
 * Oldest debt first, because age is what turns credit into a problem. The age
 * carries the colour rather than a separate marker, so the thing that decides
 * whether to call is the thing that catches the eye.
 */
export function ChaseList({ debtors }: { debtors: Debtor[] }) {
  if (debtors.length === 0) return null

  return (
    <section className="mt-5">
      <h2 className="mb-[9px] px-1 text-[15px] font-bold tracking-[-0.2px] text-ink">Chase first</h2>
      <div className="rounded-[18px] bg-surface px-[15px] shadow-card">
        {debtors.map((debtor, i) => (
          <Link
            key={debtor.customerId}
            to={`/commercial/customers/${debtor.customerId}`}
            className={`flex items-center justify-between gap-3 py-[11px] ${
              i < debtors.length - 1 ? 'border-b border-borderMuted' : ''
            }`}
          >
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13.5px] font-bold text-ink">{debtor.name}</p>
              <p className={`mt-[2px] text-[11.5px] font-bold ${ageTint(debtor.oldestDays)}`}>
                unpaid for {debtor.oldestDays} days
              </p>
            </div>
            <p className="shrink-0 font-display text-[15px] font-bold tabular-nums text-ink">
              {formatCurrency(debtor.due)}
            </p>
          </Link>
        ))}
      </div>
    </section>
  )
}

// Two months is where a distributor's credit stops being a cycle and starts
// being a loss; one month is the warning before it.
function ageTint(days: number) {
  if (days >= 60) return 'text-[#C23B22]'
  if (days >= 30) return 'text-[#E4571B]'
  return 'text-subtle'
}
