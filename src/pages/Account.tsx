import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { useAgencySettings } from '../hooks/useAgencySettings'
import { supabase } from '../lib/supabase'
import { InitialsBadge } from '../components/InitialsBadge'
import { ChevronLeftIcon, WhatsAppIcon } from '../components/icons'

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)
const rowCls =
  'flex items-center justify-between rounded-[16px] bg-surface px-[18px] py-[17px] text-[14.5px] font-bold text-ink shadow-card'

export function Account() {
  const { profile, signOut } = useAuth()
  const { data } = useAgencySettings()
  const navigate = useNavigate()
  const isOwner = profile?.role === 'owner'
  // Just the headline "N of M on", so the row can say where things stand
  // without the owner having to open the screen to find out. The switches
  // themselves live there.
  const [counts, setCounts] = useState<{ withPhone: number; on: number } | null>(null)

  useEffect(() => {
    if (!isOwner) return
    let cancelled = false
    const withPhone = supabase
      .from('customers')
      .select('id', { count: 'exact', head: true })
      .not('phone', 'is', null)
    const on = supabase
      .from('customers')
      .select('id', { count: 'exact', head: true })
      .not('phone', 'is', null)
      .eq('whatsapp_enabled', true)
    void Promise.all([withPhone, on]).then(([all, enabled]) => {
      if (cancelled) return
      setCounts({ withPhone: all.count ?? 0, on: enabled.count ?? 0 })
    })
    return () => {
      cancelled = true
    }
  }, [isOwner])

  return (
    <div className="p-4">
      {/* navigate(-1), not a link to "/": this page is reached from both the
          commercial and the domestic side. But a deep link or a cold PWA
          launch can land here as the first history entry, where -1 leaves
          the app (or no-ops) -- fall back to "/" so the router can send the
          owner to the right segment instead. */}
      <button
        onClick={() => (window.history.state?.idx ? navigate(-1) : navigate('/'))}
        className="mb-3 inline-flex items-center gap-[6px] py-[6px] text-sm font-bold text-muted"
      >
        <ChevronLeftIcon size={18} /> Back
      </button>

      <div className="mb-6 flex items-center gap-3">
        <InitialsBadge name={profile?.name ?? '?'} size={60} radius={18} />
        <div className="min-w-0">
          <p className="truncate font-display text-[22px] font-bold tracking-[-0.4px] text-ink">
            {profile?.name}
          </p>
          <p className="text-[12.5px] font-semibold text-muted">
            {data?.business_name || 'Cylinder Tracker'}
            {profile?.role ? ` · ${cap(profile.role)}` : ''}
          </p>
        </div>
      </div>

      <div className="space-y-[10px]">
        {isOwner && (
          <Link to="/commercial/reports" className={rowCls}>
            Reports <span className="text-[#C0B4A2]">›</span>
          </Link>
        )}
        {isOwner && (
          <Link to="/account/staff" className={rowCls}>
            Staff <span className="text-[#C0B4A2]">›</span>
          </Link>
        )}
        {/* Products and prices are edited from the Godown / Stock screen. */}
        <Link to="/account/business" className={rowCls}>
          Business details <span className="text-[#C0B4A2]">›</span>
        </Link>
        {/* Navigates rather than toggling in place: the screen behind it holds
            a switch per customer, and the count here says where things stand
            without having to open it. */}
        {isOwner && (
          <Link to="/account/whatsapp" className={rowCls}>
            <span className="flex items-center gap-[10px]">
              <WhatsAppIcon size={18} />
              Push Notifications to WhatsApp
            </span>
            <span className="flex items-center gap-[8px]">
              {counts !== null && counts.withPhone > 0 && (
                <span className="text-[12.5px] font-semibold text-subtle">
                  {counts.on} of {counts.withPhone}
                </span>
              )}
              <span className="text-[#C0B4A2]">›</span>
            </span>
          </Link>
        )}
      </div>

      <button
        onClick={signOut}
        className="mt-6 h-[52px] w-full rounded-[16px] border-[1.5px] border-borderMuted bg-surface text-[15px] font-bold"
        style={{ color: '#C23B22' }}
      >
        Sign out
      </button>

    </div>
  )
}
