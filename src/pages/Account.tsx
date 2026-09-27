import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { useAgencySettings } from '../hooks/useAgencySettings'
import { supabase } from '../lib/supabase'
import { InitialsBadge } from '../components/InitialsBadge'
import { AlertDialog } from '../components/AlertDialog'
import { Toggle } from '../components/Toggle'
import { ChevronLeftIcon, WhatsAppIcon } from '../components/icons'

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)
const rowCls =
  'flex items-center justify-between rounded-[16px] bg-surface px-[18px] py-[17px] text-[14.5px] font-bold text-ink shadow-card'

export function Account() {
  const { profile, signOut } = useAuth()
  const { data } = useAgencySettings()
  const navigate = useNavigate()
  const isOwner = profile?.role === 'owner'
  // How many customers could receive a bill, and how many currently do. The
  // switch here covers all of them at once; per-customer switches are behind
  // the chevron.
  const [counts, setCounts] = useState<{ withPhone: number; on: number } | null>(null)
  // Which direction the switch was moved, or null when no dialog is open. It
  // only moves once the write lands, so cancelling leaves it where it was.
  const [pending, setPending] = useState<boolean | null>(null)
  const [working, setWorking] = useState(false)
  const [alert, setAlert] = useState<string | null>(null)

  const loadCounts = useCallback(async () => {
    const withPhone = supabase
      .from('customers')
      .select('id', { count: 'exact', head: true })
      .not('phone', 'is', null)
    const on = supabase
      .from('customers')
      .select('id', { count: 'exact', head: true })
      .not('phone', 'is', null)
      .eq('whatsapp_enabled', true)
    const [all, enabled] = await Promise.all([withPhone, on])
    setCounts({ withPhone: all.count ?? 0, on: enabled.count ?? 0 })
  }, [])

  useEffect(() => {
    if (isOwner) void loadCounts()
  }, [isOwner, loadCounts])

  // On only when everyone who could receive a bill does. A partly-on list
  // reads as off, because that is the state the switch would change.
  const allOn = counts !== null && counts.withPhone > 0 && counts.on === counts.withPhone
  const affected = counts === null ? 0 : pending ? counts.withPhone - counts.on : counts.on

  async function applyToEveryone(next: boolean) {
    setWorking(true)
    const { error: updateError, count } = await supabase
      .from('customers')
      .update({ whatsapp_enabled: next }, { count: 'exact' })
      .not('phone', 'is', null)
      .eq('whatsapp_enabled', !next)
    setWorking(false)
    setPending(null)
    setAlert(
      updateError
        ? updateError.message
        : `WhatsApp turned ${next ? 'on' : 'off'} for ${count ?? 0} customer${count === 1 ? '' : 's'}`,
    )
    void loadCounts()
  }

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
        {/* The row does both: the switch covers everyone at once, the chevron
            opens the per-customer list. The switch swallows its own tap so
            flipping it does not also navigate. */}
        {isOwner && (
          <Link to="/account/whatsapp" className={rowCls}>
            <span className="flex min-w-0 items-center gap-[10px]">
              <WhatsAppIcon size={18} />
              <span className="truncate">Push Notifications to WhatsApp</span>
            </span>
            <span className="flex shrink-0 items-center gap-[10px]">
              <span
                onClick={(e) => {
                  e.preventDefault()
                  e.stopPropagation()
                }}
              >
                <Toggle
                  checked={allOn}
                  onChange={(next) => setPending(next)}
                  disabled={counts === null || counts.withPhone === 0}
                  label="Push Notifications to WhatsApp for everyone with a phone number"
                  onColor="#25D366"
                />
              </span>
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

      <AlertDialog
        open={pending !== null}
        onClose={() => setPending(null)}
        onConfirm={() => void applyToEveryone(pending === true)}
        title={
          pending
            ? `Send bills on WhatsApp to ${affected} customer${affected === 1 ? '' : 's'}?`
            : `Stop sending bills on WhatsApp to ${affected} customer${affected === 1 ? '' : 's'}?`
        }
        message={
          pending
            ? 'Everyone with a phone number starts receiving their bills on WhatsApp, from their next bill onward.'
            : 'Nobody receives bills on WhatsApp after this. You can switch individual customers back on from this screen.'
        }
        actionLabel={working ? 'Saving…' : pending ? 'Turn on' : 'Turn off'}
      />
      <AlertDialog open={alert !== null} onClose={() => setAlert(null)} title={alert ?? ''} />
    </div>
  )
}
