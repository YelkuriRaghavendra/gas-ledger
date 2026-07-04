import { Link } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { useCustomerBalances } from '../hooks/useCustomerBalances'
import { useAllCustomerProductBalances } from '../hooks/useAllCustomerProductBalances'
import { useActivityFeed } from '../hooks/useActivityFeed'
import { formatCurrency, formatRelativeDate } from '../utils/format'
import { getActivityIcon, getActivityTint } from '../utils/activityIcon'
import { HeroCard } from '../components/HeroCard'
import { InitialsBadge } from '../components/InitialsBadge'

export function Home() {
  const { profile } = useAuth()
  const { data, loading, error } = useCustomerBalances()
  const { data: productBalances } = useAllCustomerProductBalances()
  const { data: activity } = useActivityFeed(5)

  const totalDue = data.reduce((sum, c) => sum + c.amount_due, 0)
  const totalSold = productBalances.reduce((sum, pb) => sum + pb.sold, 0)
  const totalReturned = productBalances.reduce((sum, pb) => sum + pb.returned, 0)
  const totalEmptiesOut = productBalances.reduce((sum, pb) => sum + pb.empties_outstanding, 0)
  const customersWithDue = data.filter((c) => c.amount_due > 0).length

  const today = new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' })

  return (
    <div className="p-5 pb-[110px] pt-2">
      <div className="mb-[22px] flex items-start justify-between">
        <div>
          <p className="text-[13px] font-semibold text-muted">{today}</p>
          <p className="mt-[2px] font-display text-2xl font-bold tracking-[-0.4px] text-ink">
            Hello, {profile?.name ?? '…'}
          </p>
        </div>
        <InitialsBadge name={profile?.name ?? '?'} size={44} radius={14} />
      </div>

      {loading && <p className="text-muted">Loading…</p>}
      {error && <p className="text-red-600">{error}</p>}

      {!loading && !error && (
        <>
          <HeroCard>
            <svg
              width="150"
              height="150"
              viewBox="0 0 24 24"
              fill="rgba(228,87,27,.14)"
              className="pointer-events-none absolute -bottom-10 -right-[30px]"
            >
              <rect x="6" y="6" width="12" height="16.5" rx="5" />
              <rect x="8.6" y="3.6" width="6.8" height="2.6" rx="1.3" />
            </svg>
            <p className="relative text-[13px] font-semibold text-[#C9BBA8]">Amount to collect</p>
            <p className="relative font-display text-[42px] font-bold leading-none text-white">
              {formatCurrency(totalDue)}
            </p>
            <p className="relative mt-[7px] text-[12.5px] font-semibold text-mutedOnDark">
              outstanding from {customersWithDue} customers
            </p>
            <div className="relative mt-[18px] flex items-center gap-4">
              <div>
                <p className="text-xs font-semibold text-mutedOnDark">Sold</p>
                <p className="font-display text-[19px] font-semibold text-white">{totalSold}</p>
              </div>
              <div className="h-[30px] w-px bg-white/[.14]" />
              <div>
                <p className="text-xs font-semibold text-mutedOnDark">Returned</p>
                <p className="font-display text-[19px] font-semibold text-[#5FCF97]">{totalReturned}</p>
              </div>
              <div className="h-[30px] w-px bg-white/[.14]" />
              <div>
                <p className="text-xs font-semibold text-mutedOnDark">Empties out</p>
                <p className="font-display text-[19px] font-semibold text-[#FF8A4C]">{totalEmptiesOut}</p>
              </div>
            </div>
          </HeroCard>

          <div className="my-[14px] grid grid-cols-2 gap-3">
            <Link
              to="/sale"
              className="flex flex-col items-start gap-[10px] rounded-[18px] bg-accent p-4 text-white shadow-[0_10px_22px_-12px_rgba(228,87,27,0.7)]"
            >
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round">
                <path d="M5 12h14M12 5v14" />
              </svg>
              <span className="text-[15px] font-bold">New sale</span>
            </Link>
            <Link
              to="/return"
              className="flex flex-col items-start gap-[10px] rounded-[18px] border-[1.5px] border-borderMuted bg-white p-4 text-ink"
            >
              <svg
                width="24"
                height="24"
                viewBox="0 0 24 24"
                fill="none"
                stroke="#2E8B57"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M9 14 4 9l5-5" />
                <path d="M4 9h11a5 5 0 0 1 5 5v0a5 5 0 0 1-5 5H9" />
              </svg>
              <span className="text-[15px] font-bold">Log return</span>
            </Link>
          </div>

          <div className="mb-3 flex items-baseline justify-between">
            <h2 className="font-display text-[17px] font-semibold text-ink">Recent activity</h2>
            <Link to="/activity" className="text-[13px] font-bold text-accent">
              See all
            </Link>
          </div>
          <ul className="flex flex-col gap-[10px]">
            {activity.map((entry) => {
              const tint = getActivityTint(entry.type)
              return (
                <li
                  key={entry.id}
                  className="flex items-center gap-3 rounded-2xl border border-[#EFE7D8] bg-white px-[14px] py-[13px]"
                >
                  <div
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-lg"
                    style={{ backgroundColor: tint.bg, color: tint.color }}
                  >
                    {getActivityIcon(entry.type)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-bold text-ink">{entry.customer_name}</p>
                    <p className="mt-px text-xs font-medium text-[#9A8F80]">
                      {entry.type === 'sale' &&
                        `${entry.qty}${entry.product_name ? ` ${entry.product_name}` : ''} sold · ${entry.empties} empties in`}
                      {entry.type === 'return' && `${entry.product_name ? `${entry.product_name} ` : ''}empties returned`}
                      {entry.type === 'payment' && 'Payment received'}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="font-display text-[15px] font-bold" style={{ color: tint.color }}>
                      {entry.type === 'sale' && `+${entry.qty}`}
                      {entry.type === 'return' && `−${entry.qty}`}
                      {entry.type === 'payment' && formatCurrency(entry.amount)}
                    </p>
                    <p className="text-[11px] font-semibold text-[#B3A796]">{formatRelativeDate(entry.created_at)}</p>
                  </div>
                </li>
              )
            })}
            {activity.length === 0 && <p className="text-muted">No activity yet.</p>}
          </ul>
        </>
      )}
    </div>
  )
}
