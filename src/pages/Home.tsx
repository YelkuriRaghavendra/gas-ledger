import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useCustomerBalances } from '../hooks/useCustomerBalances'
import { useAllCustomerProductBalances } from '../hooks/useAllCustomerProductBalances'
import { useGodownStock } from '../hooks/useGodownStock'
import { useProducts } from '../hooks/useProducts'
import { useActivityFeed } from '../hooks/useActivityFeed'
import { useDailySummary } from '../hooks/useDailySummary'
import { formatCurrency, formatRelativeDate } from '../utils/format'
import { getActivityIcon, getActivityTint } from '../utils/activityIcon'
import { HeroCard } from '../components/HeroCard'
import { AppHeader } from '../components/AppHeader'
import { AccountMenu } from '../components/AccountMenu'
import { CylindersCard, type CardItem } from '../components/CylindersCard'

export function Home() {
  const [accountOpen, setAccountOpen] = useState(false)
  const { data, loading, error } = useCustomerBalances()
  const { data: productBalances } = useAllCustomerProductBalances()
  const { data: godown } = useGodownStock()
  const { data: products } = useProducts()
  const { data: activity } = useActivityFeed(3)
  const { products: dailyProducts } = useDailySummary()

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
      capacity: g?.godown_capacity ?? null,
    }
  })

  const emptiesOutTotal = productRows.reduce((sum, r) => sum + r.emptiesOut, 0)
  const soldToday = dailyProducts.reduce((sum, p) => sum + p.cylinders_sold, 0)

  const cylinderItems: CardItem[] = productRows.map((r) => ({
    name: r.name,
    emptiesWithCustomers: r.emptiesOut,
    full: r.full,
    empty: r.empty,
  }))

  return (
    <div className="pb-[110px]">
      <AppHeader segment="commercial" onOpenAccount={() => setAccountOpen(true)} />
      <AccountMenu open={accountOpen} onClose={() => setAccountOpen(false)} />

      <div className="px-4">
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
              <p className="relative text-[11px] font-bold uppercase tracking-[0.5px] text-[#C9BBA8]">
                Outstanding dues
              </p>
              <p className="relative mt-1 font-display text-[38px] font-bold leading-none tracking-[-1px] text-white">
                {formatCurrency(totalDue)}
              </p>
              <Link to="/customers" className="relative mt-[9px] inline-flex items-center gap-1 text-[12.5px] font-semibold text-mutedOnDark">
                from {customersWithDue} customer{customersWithDue === 1 ? '' : 's'} ›
              </Link>
              <div className="relative mt-[15px] flex items-center gap-5">
                <div>
                  <p className="text-[10px] font-semibold text-mutedOnDark">Empties out</p>
                  <p className="mt-[1px] font-display text-[16px] font-semibold text-[#5FCF97]">{emptiesOutTotal}</p>
                </div>
                <div className="h-[26px] w-px bg-white/[.14]" />
                <div>
                  <p className="text-[10px] font-semibold text-mutedOnDark">Sold today</p>
                  <p className="mt-[1px] font-display text-[16px] font-semibold text-white">{soldToday}</p>
                </div>
              </div>
            </HeroCard>

            <CylindersCard items={cylinderItems} accent="orange" linkLabel="Godown" linkTo="/godown" />

            <div className="mb-3 mt-[18px] flex items-baseline justify-between">
              <h2 className="font-display text-[18px] font-bold tracking-[-0.3px] text-ink">Recent activity</h2>
              <Link to="/activity" className="text-[13px] font-bold text-accent">
                See all ›
              </Link>
            </div>
            <ul className="flex flex-col gap-[10px]">
              {activity.map((entry) => {
                const tint = getActivityTint(entry.type)
                return (
                  <li
                    key={`${entry.type}-${entry.id}`}
                    className="flex items-center gap-[13px] rounded-[18px] bg-surface px-[15px] py-[14px] shadow-card"
                  >
                    <div
                      className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[14px] text-lg"
                      style={{ backgroundColor: tint.bg, color: tint.color }}
                    >
                      {getActivityIcon(entry.type)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[14.5px] font-bold text-ink">{entry.title}</p>
                      <p className="mt-[2px] text-xs font-medium text-subtle">
                        {entry.type === 'sale' &&
                          `${entry.qty}${entry.product_name ? ` ${entry.product_name}` : ''} sold · ${entry.empties} empties in`}
                        {entry.type === 'return' && `${entry.product_name ? `${entry.product_name} ` : ''}empties returned`}
                        {entry.type === 'payment' && 'Payment received'}
                        {entry.type === 'purchase' && `${entry.qty} in`}
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="font-display text-[15px] font-bold" style={{ color: tint.color }}>
                        {entry.type === 'sale' && `+${entry.qty}`}
                        {entry.type === 'return' && `−${entry.qty}`}
                        {entry.type === 'payment' && formatCurrency(entry.amount)}
                        {entry.type === 'purchase' && `+${entry.qty}`}
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
    </div>
  )
}
