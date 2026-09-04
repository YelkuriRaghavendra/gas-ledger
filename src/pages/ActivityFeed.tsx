import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { supabase } from '../lib/supabase'
import { AppHeader } from '../components/AppHeader'
import { AccountMenu } from '../components/AccountMenu'
import { DetailModal } from '../components/DetailModal'
import { useActivityFeed, type FeedItem } from '../hooks/useActivityFeed'
import { useProfiles } from '../hooks/useProfiles'
import { dateInputValue, formatCurrency, formatDate, formatRelativeDate, formatUpdated } from '../utils/format'
import { getActivityIcon, getActivityTint } from '../utils/activityIcon'
import { subtitleFor, detailTitle, detailRows, editPath } from '../utils/activityDetail'
import { ChevronLeftIcon } from '../components/icons'

type Filter = 'all' | FeedItem['type']

const FILTERS: { key: Filter; label: string; noun: string }[] = [
  { key: 'all', label: 'All', noun: 'activity' },
  { key: 'sale', label: 'Sales', noun: 'sales' },
  { key: 'return', label: 'Returns', noun: 'returns' },
  { key: 'payment', label: 'Payments', noun: 'payments' },
  { key: 'purchase', label: 'Purchases', noun: 'purchases' },
]

function timeOf(iso: string) {
  return new Date(iso).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })
}

// Money that actually came in: standalone payments plus sales settled on the spot.
function collectedFrom(entries: FeedItem[]) {
  return entries.reduce((sum, e) => {
    if (e.type === 'payment') return sum + e.amount
    if (e.type === 'sale' && e.paid) return sum + e.amount
    return sum
  }, 0)
}

const firstOfMonth = (d: Date) => new Date(d.getFullYear(), d.getMonth(), 1).getTime()

export function ActivityFeed() {
  const { profile } = useAuth()
  const [accountOpen, setAccountOpen] = useState(false)
  const [selected, setSelected] = useState<FeedItem | null>(null)
  const [filter, setFilter] = useState<Filter>('all')
  // The month being browsed, held as the timestamp of its 1st so the value
  // stays a primitive and the feed query below doesn't refetch every render.
  const [monthStart, setMonthStart] = useState(() => firstOfMonth(new Date()))
  const isOwner = profile?.role === 'owner'
  const profileNames = useProfiles()

  const monthLabel = new Date(monthStart).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' })
  const atCurrentMonth = monthStart >= firstOfMonth(new Date())

  const from = useMemo(() => new Date(monthStart).toISOString(), [monthStart])
  const to = useMemo(() => {
    const d = new Date(monthStart)
    return new Date(d.getFullYear(), d.getMonth() + 1, 1).toISOString()
  }, [monthStart])

  const shiftMonth = (by: number) => {
    const d = new Date(monthStart)
    setMonthStart(new Date(d.getFullYear(), d.getMonth() + by, 1).getTime())
  }

  // A busy month can run well past the 50-row default.
  const { data, loading, error, refresh } = useActivityFeed(500, 'commercial', from, to)

  async function handleDelete(entry: FeedItem) {
    if (!confirm('Delete this entry?')) return
    setSelected(null)
    if (entry.type === 'purchase') {
      await supabase.from('purchase_orders').delete().eq('id', entry.id)
    } else {
      await supabase.from('bills').delete().eq('id', entry.id)
    }
    refresh()
  }

  const counts = useMemo(() => {
    const c: Record<Filter, number> = { all: data.length, sale: 0, return: 0, payment: 0, purchase: 0 }
    for (const e of data) c[e.type] += 1
    return c
  }, [data])

  const shown = useMemo(
    () => (filter === 'all' ? data : data.filter((e) => e.type === filter)),
    [data, filter],
  )

  // The feed arrives newest-first, so day groups keep that order for free.
  const days = useMemo(() => {
    const groups = new Map<string, FeedItem[]>()
    for (const e of shown) {
      const key = dateInputValue(e.created_at)
      const bucket = groups.get(key)
      if (bucket) bucket.push(e)
      else groups.set(key, [e])
    }
    return [...groups.entries()]
  }, [shown])

  const activeFilter = FILTERS.find((f) => f.key === filter)!

  return (
    <div className="pb-[110px]">
      <AppHeader view="commercial" onOpenAccount={() => setAccountOpen(true)} />
      <AccountMenu open={accountOpen} onClose={() => setAccountOpen(false)} />

      <div className="px-5 pt-1">
        {/* Title and month browser share one line. The label is fixed-width so
            the arrows hold still as the month changes under them. */}
        <div className="mb-[12px] flex items-center justify-between gap-3">
          <h1 className="font-display text-[26px] font-bold tracking-[-0.5px] text-ink">Activity</h1>
          <div className="flex shrink-0 items-center rounded-[11px] bg-surface p-[3px] shadow-card">
            <button
              type="button"
              onClick={() => shiftMonth(-1)}
              aria-label="Previous month"
              className="grid h-8 w-8 place-items-center rounded-[9px] text-muted transition active:scale-95 active:bg-cream"
            >
              <ChevronLeftIcon size={17} />
            </button>
            <p className="min-w-[70px] text-center font-display text-[13px] font-bold tracking-[-0.2px] text-ink">
              {monthLabel}
            </p>
            <button
              type="button"
              onClick={() => shiftMonth(1)}
              disabled={atCurrentMonth}
              aria-label="Next month"
              className="grid h-8 w-8 place-items-center rounded-[9px] text-muted transition active:scale-95 active:bg-cream disabled:opacity-25"
            >
              <span className="rotate-180">
                <ChevronLeftIcon size={17} />
              </span>
            </button>
          </div>
        </div>

        {error && <p className="mb-4 text-sm font-semibold text-red-600">{error}</p>}

        {/* Type filters — one scrolling line; bleeds to the screen edges so a
            partly-visible chip reads as "more this way" rather than as clipped. */}
        <div className="no-scrollbar -mx-5 flex gap-2 overflow-x-auto px-5 pb-1">
          {FILTERS.map((f) => {
            const active = filter === f.key
            return (
              <button
                key={f.key}
                type="button"
                onClick={() => setFilter(f.key)}
                aria-pressed={active}
                className={`flex shrink-0 items-center gap-[6px] rounded-full py-[9px] pl-[14px] pr-[11px] text-[13px] font-bold transition active:scale-[0.97] ${
                  active ? 'bg-ink text-white' : 'bg-surface text-muted shadow-card'
                }`}
              >
                {f.label}
                <span
                  className={`rounded-full px-[6px] py-px font-display text-[11px] font-bold ${
                    active ? 'bg-white/[.16] text-white' : 'bg-cream text-subtle'
                  }`}
                >
                  {counts[f.key]}
                </span>
              </button>
            )
          })}
        </div>

        {loading && <p className="mt-5 text-sm font-medium text-muted">Loading…</p>}

        {!loading && days.length === 0 && (
          <p className="mt-4 rounded-[18px] bg-surface px-5 py-9 text-center text-sm font-medium text-subtle shadow-card">
            No {activeFilter.noun} in {monthLabel}.
          </p>
        )}

        {days.map(([key, entries]) => {
          const dayCollected = collectedFrom(entries)
          return (
            <section key={key} className="mt-[10px]">
              <div className="sticky top-0 z-10 -mx-5 flex items-baseline justify-between bg-cream px-5 py-[9px]">
                <h2 className="font-display text-[14px] font-bold tracking-[-0.2px] text-ink">
                  {formatRelativeDate(entries[0].created_at)}
                </h2>
                {dayCollected > 0 && (
                  <p className="text-[11.5px] font-semibold text-subtle">
                    <span className="font-display font-bold text-muted">{formatCurrency(dayCollected)}</span> collected
                  </p>
                )}
              </div>

              <ul className="overflow-hidden rounded-[18px] bg-surface py-[5px] shadow-card">
                {entries.map((entry) => {
                  const tint = getActivityTint(entry.type)
                  return (
                    <li key={`${entry.type}-${entry.id}`}>
                      <button
                        type="button"
                        onClick={() => setSelected(entry)}
                        className="flex w-full items-center gap-[13px] px-[15px] py-[7px] text-left transition active:bg-cream"
                      >
                        <div
                          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[14px] text-lg"
                          style={{ backgroundColor: tint.bg, color: tint.color }}
                        >
                          {getActivityIcon(entry.type)}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-[14.5px] font-bold text-ink">{entry.title}</p>
                          <p className="mt-[2px] truncate text-xs font-medium text-subtle">{subtitleFor(entry)}</p>
                        </div>
                        <div className="shrink-0 text-right">
                          <p className="font-display text-[15px] font-bold" style={{ color: tint.color }}>
                            {entry.type === 'sale' && `+${entry.qty}`}
                            {entry.type === 'return' && (entry.outright ? `${entry.qty}` : `−${entry.qty}`)}
                            {entry.type === 'purchase' && `+${entry.qty}`}
                            {entry.type === 'payment' && formatCurrency(entry.amount)}
                          </p>
                          <p className="mt-px text-[11px] font-semibold text-subtle">{timeOf(entry.created_at)}</p>
                        </div>
                      </button>
                    </li>
                  )
                })}
              </ul>
            </section>
          )
        })}
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
