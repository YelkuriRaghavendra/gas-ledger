import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { supabase } from '../lib/supabase'
import { AppHeader } from '../components/AppHeader'
import { AccountMenu } from '../components/AccountMenu'
import { DetailModal } from '../components/DetailModal'
import { useActivityFeed, type FeedItem } from '../hooks/useActivityFeed'
import { useProfiles } from '../hooks/useProfiles'
import { formatCurrency, formatDate, formatRelativeDate, formatUpdated } from '../utils/format'
import { getActivityIcon, getActivityTint } from '../utils/activityIcon'
import { subtitleFor, detailTitle, detailRows, editPath } from '../utils/activityDetail'

export function ActivityFeed() {
  const { data, loading, error, refresh } = useActivityFeed(50)
  const { profile } = useAuth()
  const [accountOpen, setAccountOpen] = useState(false)
  const [selected, setSelected] = useState<FeedItem | null>(null)
  const isOwner = profile?.role === 'owner'
  const profileNames = useProfiles()

  async function handleDelete(entry: FeedItem) {
    if (!confirm('Delete this entry?')) return
    setSelected(null)
    if (entry.type === 'purchase') {
      await supabase.from('purchases').delete().eq('id', entry.id)
    } else {
      await supabase.from('transactions').delete().eq('id', entry.id)
    }
    refresh()
  }

  return (
    <div className="pb-[110px]">
      <AppHeader segment="commercial" onOpenAccount={() => setAccountOpen(true)} />
      <AccountMenu open={accountOpen} onClose={() => setAccountOpen(false)} />

      <div className="px-5 pt-1">
        <h1 className="mb-5 font-display text-[26px] font-bold tracking-[-0.5px] text-ink">Activity</h1>
        {loading && <p className="text-muted">Loading…</p>}
        {error && <p className="text-red-600">{error}</p>}
        <ul className="flex flex-col gap-[10px]">
          {data.map((entry) => {
            const tint = getActivityTint(entry.type)
            return (
              <li key={`${entry.type}-${entry.id}`} className="rounded-[18px] bg-surface px-[15px] py-[14px] shadow-card">
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
                      {entry.type === 'purchase' && `+${entry.qty}`}
                      {entry.type === 'payment' && formatCurrency(entry.amount)}
                    </p>
                    <p className="mt-px text-[11px] font-semibold text-subtle">{formatRelativeDate(entry.created_at)}</p>
                  </div>
                </button>
              </li>
            )
          })}
          {!loading && data.length === 0 && (
            <li className="rounded-[18px] bg-surface px-4 py-8 text-center text-sm font-medium text-subtle shadow-card">
              No activity yet
            </li>
          )}
        </ul>
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
