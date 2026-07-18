import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { supabase } from '../lib/supabase'
import { useCustomerBalances } from '../hooks/useCustomerBalances'
import { useAllCustomerProductBalances } from '../hooks/useAllCustomerProductBalances'
import { useGodownStock } from '../hooks/useGodownStock'
import { useProducts } from '../hooks/useProducts'
import { useActivityFeed, type FeedItem } from '../hooks/useActivityFeed'
import { useProfiles } from '../hooks/useProfiles'
import { useDailySummary } from '../hooks/useDailySummary'
import { emptiesOwed, formatCurrency, formatDate, formatRelativeDate, formatUpdated } from '../utils/format'
import { getActivityIcon, getActivityTint } from '../utils/activityIcon'
import { subtitleFor, detailTitle, detailRows, editPath } from '../utils/activityDetail'
import { HeroCard } from '../components/HeroCard'
import { AppHeader } from '../components/AppHeader'
import { AccountMenu } from '../components/AccountMenu'
import { CylindersCard, type CardItem } from '../components/CylindersCard'
import { DetailModal } from '../components/DetailModal'

export function Home() {
  const [accountOpen, setAccountOpen] = useState(false)
  const [selected, setSelected] = useState<FeedItem | null>(null)
  const { profile } = useAuth()
  const isOwner = profile?.role === 'owner'
  const profileNames = useProfiles()
  const { data, loading, error } = useCustomerBalances()
  const { data: productBalances } = useAllCustomerProductBalances()
  const { data: godown } = useGodownStock()
  const { data: products } = useProducts()
  const { data: activity, refresh: refreshActivity } = useActivityFeed(3)
  const { products: dailyProducts } = useDailySummary()

  async function handleDelete(entry: FeedItem) {
    if (!confirm('Delete this entry?')) return
    setSelected(null)
    if (entry.type === 'purchase') {
      await supabase.from('purchases').delete().eq('id', entry.id)
    } else {
      await supabase.from('transactions').delete().eq('id', entry.id)
    }
    refreshActivity()
  }

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
      <AppHeader view="commercial" onOpenAccount={() => setAccountOpen(true)} />
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
              <Link to="/commercial/customers" className="relative mt-[9px] inline-flex items-center gap-1 text-[12.5px] font-semibold text-mutedOnDark">
                from {customersWithDue} customer{customersWithDue === 1 ? '' : 's'} ›
              </Link>
              <div className="relative mt-[15px] flex items-center gap-5">
                <div>
                  <p className="text-[10px] font-semibold text-mutedOnDark">{emptiesOwed(emptiesOutTotal).owedBy === 'agency' ? 'Advance' : 'Pending'}</p>
                  <p className="mt-[1px] font-display text-[16px] font-semibold text-[#5FCF97]">{emptiesOwed(emptiesOutTotal).count}</p>
                </div>
                <div className="h-[26px] w-px bg-white/[.14]" />
                <div>
                  <p className="text-[10px] font-semibold text-mutedOnDark">Sold today</p>
                  <p className="mt-[1px] font-display text-[16px] font-semibold text-white">{soldToday}</p>
                </div>
              </div>
            </HeroCard>

            <CylindersCard items={cylinderItems} accent="orange" linkLabel="Godown" linkTo="/commercial/godown" />

            <div className="mb-3 mt-[18px] flex items-baseline justify-between">
              <h2 className="font-display text-[18px] font-bold tracking-[-0.3px] text-ink">Recent activity</h2>
              <Link to="/commercial/activity" className="text-[13px] font-bold text-accent">
                See all ›
              </Link>
            </div>
            <ul className="flex flex-col gap-[10px]">
              {activity.map((entry) => {
                const tint = getActivityTint(entry.type)
                return (
                  <li
                    key={`${entry.type}-${entry.id}`}
                    className="rounded-[18px] bg-surface px-[15px] py-[14px] shadow-card"
                  >
                    <button
                      type="button"
                      onClick={() => setSelected(entry)}
                      className="flex w-full items-center gap-[13px] text-left"
                    >
                      <div
                        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[14px] text-lg"
                        style={{ backgroundColor: tint.bg, color: tint.color }}
                      >
                        {getActivityIcon(entry.type)}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[14.5px] font-bold text-ink">{entry.title}</p>
                        <p className="mt-[2px] text-xs font-medium text-subtle">{subtitleFor(entry)}</p>
                      </div>
                      <div className="shrink-0 text-right">
                        <p className="font-display text-[15px] font-bold" style={{ color: tint.color }}>
                          {entry.type === 'sale' && `+${entry.qty}`}
                          {entry.type === 'return' && (entry.outright ? `${entry.qty}` : `−${entry.qty}`)}
                          {entry.type === 'payment' && formatCurrency(entry.amount)}
                          {entry.type === 'purchase' && `+${entry.qty}`}
                        </p>
                        <p className="mt-px text-[11px] font-semibold text-subtle">{formatRelativeDate(entry.created_at)}</p>
                      </div>
                    </button>
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

      {selected && (
        <DetailModal
          open={selected !== null}
          onClose={() => setSelected(null)}
          icon={getActivityIcon(selected.type)}
          iconBg={getActivityTint(selected.type).bg}
          iconColor={getActivityTint(selected.type).color}
          title={detailTitle(selected)}
          amount={formatCurrency(selected.amount)}
          rows={detailRows(selected)}
          created={formatDate(selected.created_at)}
          createdBy={selected.created_by ? profileNames.get(selected.created_by) : undefined}
          updated={formatUpdated(selected.updated_at, selected.created_at)}
          updatedBy={selected.updated_by ? profileNames.get(selected.updated_by) : undefined}
          actions={
            isOwner ? (
              <>
                <Link
                  to={editPath(selected)}
                  onClick={() => setSelected(null)}
                  className="flex h-[48px] flex-1 items-center justify-center rounded-[14px] bg-gradient-to-br from-accentSoft to-accent font-bold text-white shadow-glow transition active:scale-[0.99]"
                >
                  Edit
                </Link>
                <button
                  type="button"
                  onClick={() => handleDelete(selected)}
                  className="flex h-[48px] flex-1 items-center justify-center rounded-[14px] bg-[#FBEAE6] font-bold text-[#C23B22] transition active:scale-[0.99]"
                >
                  Delete
                </button>
              </>
            ) : undefined
          }
        />
      )}
    </div>
  )
}
