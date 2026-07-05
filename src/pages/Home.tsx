import { Link } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { useCustomerBalances } from '../hooks/useCustomerBalances'
import { useAllCustomerProductBalances } from '../hooks/useAllCustomerProductBalances'
import { useGodownStock } from '../hooks/useGodownStock'
import { useProducts } from '../hooks/useProducts'
import { useActivityFeed } from '../hooks/useActivityFeed'
import { formatCurrency, formatRelativeDate } from '../utils/format'
import { getActivityIcon, getActivityTint } from '../utils/activityIcon'
import { HeroCard } from '../components/HeroCard'
import { InitialsBadge } from '../components/InitialsBadge'
import { PlusIcon, ReturnIcon, CreditCardIcon } from '../components/icons'

export function Home() {
  const { profile } = useAuth()
  const { data, loading, error } = useCustomerBalances()
  const { data: productBalances } = useAllCustomerProductBalances()
  const { data: godown } = useGodownStock()
  const { data: products } = useProducts()
  const { data: activity } = useActivityFeed(4)

  const totalDue = data.reduce((sum, c) => sum + c.amount_due, 0)
  const customersWithDue = data.filter((c) => c.amount_due > 0).length

  const emptiesOutByProduct = new Map<number, number>()
  for (const pb of productBalances) {
    emptiesOutByProduct.set(pb.product_id, (emptiesOutByProduct.get(pb.product_id) ?? 0) + pb.empties_outstanding)
  }

  const productRows = products.map((p) => {
    const g = godown.find((x) => x.product_id === p.id)
    return {
      id: p.id,
      name: p.name,
      emptiesOut: emptiesOutByProduct.get(p.id) ?? 0,
      full: g?.full_cylinders ?? 0,
      empty: g?.empty_cylinders ?? 0,
    }
  })

  const today = new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' })

  return (
    <div className="p-5 pb-[110px] pt-3">
      <div className="mb-6 flex items-start justify-between">
        <div>
          <p className="text-[13px] font-semibold uppercase tracking-[0.6px] text-subtle">{today}</p>
          <p className="mt-[3px] font-display text-[26px] font-bold tracking-[-0.5px] text-ink">
            Hello, {profile?.name ?? '…'}
          </p>
        </div>
        <InitialsBadge name={profile?.name ?? '?'} size={46} radius={16} />
      </div>

      {loading && <p className="text-muted">Loading…</p>}
      {error && <p className="text-red-600">{error}</p>}

      {!loading && !error && (
        <>
          <HeroCard>
            <svg
              width="170"
              height="170"
              viewBox="0 0 24 24"
              fill="rgba(228,87,27,.16)"
              className="pointer-events-none absolute -bottom-12 -right-8"
            >
              <rect x="6" y="6" width="12" height="16.5" rx="5" />
              <rect x="8.6" y="3.6" width="6.8" height="2.6" rx="1.3" />
            </svg>
            <p className="relative text-[12.5px] font-bold uppercase tracking-[0.7px] text-[#C9BBA8]">
              Amount to collect
            </p>
            <p className="relative mt-[6px] font-display text-[44px] font-bold leading-none tracking-[-1px] text-white">
              {formatCurrency(totalDue)}
            </p>
            <Link to="/customers" className="relative mt-[9px] inline-flex items-center gap-1 text-[12.5px] font-semibold text-mutedOnDark">
              from {customersWithDue} customer{customersWithDue === 1 ? '' : 's'} ›
            </Link>
          </HeroCard>

          {/* Per-product inventory — the core of a two-product agency at a glance */}
          <div className="mb-3 mt-6 flex items-baseline justify-between">
            <h2 className="font-display text-[18px] font-bold tracking-[-0.3px] text-ink">Cylinders</h2>
            <Link to="/godown" className="text-[13px] font-bold text-accent">
              Godown ›
            </Link>
          </div>
          <div className="flex flex-col gap-[11px]">
            {productRows.map((p) => (
              <div key={p.id} className="rounded-[20px] bg-surface p-[16px] shadow-card">
                <div className="mb-[14px] flex items-center gap-2">
                  <span className="rounded-lg bg-ink px-[10px] py-[4px] font-display text-[13px] font-bold text-white">
                    {p.name}
                  </span>
                </div>
                <div className="flex items-stretch">
                  <div className="flex-1">
                    <p className="text-[11px] font-bold uppercase tracking-[0.4px] text-subtle">With customers</p>
                    <p className="mt-[3px] font-display text-[24px] font-bold text-[#FF8A4C]">{p.emptiesOut}</p>
                    <p className="text-[11px] font-semibold text-subtle">empties out</p>
                  </div>
                  <div className="mx-2 w-px bg-borderMuted" />
                  <div className="flex-1">
                    <p className="text-[11px] font-bold uppercase tracking-[0.4px] text-subtle">Godown full</p>
                    <p className="mt-[3px] font-display text-[24px] font-bold text-ink">{p.full}</p>
                    <p className="text-[11px] font-semibold text-subtle">ready to sell</p>
                  </div>
                  <div className="mx-2 w-px bg-borderMuted" />
                  <div className="flex-1">
                    <p className="text-[11px] font-bold uppercase tracking-[0.4px] text-subtle">Godown empty</p>
                    <p className="mt-[3px] font-display text-[24px] font-bold text-[#2E8B57]">{p.empty}</p>
                    <p className="text-[11px] font-semibold text-subtle">to return</p>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Quick actions — the daily customer-facing jobs */}
          <div className="mb-3 mt-6 grid grid-cols-3 gap-3">
            <Link
              to="/sale"
              className="flex flex-col items-center gap-2 rounded-[18px] bg-gradient-to-br from-accentSoft to-accent py-[15px] text-white shadow-glow transition active:scale-[0.97]"
            >
              <PlusIcon size={22} color="#fff" strokeWidth={2.4} />
              <span className="text-[13px] font-bold">Sale</span>
            </Link>
            <Link
              to="/return"
              className="flex flex-col items-center gap-2 rounded-[18px] bg-surface py-[15px] text-ink shadow-card transition active:scale-[0.97]"
            >
              <ReturnIcon size={22} color="#2E8B57" strokeWidth={2.2} />
              <span className="text-[13px] font-bold">Return</span>
            </Link>
            <Link
              to="/payment"
              className="flex flex-col items-center gap-2 rounded-[18px] bg-surface py-[15px] text-ink shadow-card transition active:scale-[0.97]"
            >
              <CreditCardIcon size={22} color="#3B6EA5" strokeWidth={2.2} />
              <span className="text-[13px] font-bold">Payment</span>
            </Link>
          </div>

          <div className="mb-3 mt-6 flex items-baseline justify-between">
            <h2 className="font-display text-[18px] font-bold tracking-[-0.3px] text-ink">Recent activity</h2>
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
                  className="flex items-center gap-[13px] rounded-[18px] bg-surface px-[15px] py-[14px] shadow-card"
                >
                  <div
                    className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[14px] text-lg"
                    style={{ backgroundColor: tint.bg, color: tint.color }}
                  >
                    {getActivityIcon(entry.type)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[14.5px] font-bold text-ink">{entry.customer_name}</p>
                    <p className="mt-[2px] text-xs font-medium text-subtle">
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
                    <p className="mt-px text-[11px] font-semibold text-subtle">{formatRelativeDate(entry.created_at)}</p>
                  </div>
                </li>
              )
            })}
            {activity.length === 0 && (
              <li className="rounded-[18px] bg-surface px-[15px] py-8 text-center text-sm font-medium text-subtle shadow-card">
                No activity yet
              </li>
            )}
          </ul>
        </>
      )}
    </div>
  )
}
