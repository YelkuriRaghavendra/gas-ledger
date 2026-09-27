import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { useAgencySettings } from '../hooks/useAgencySettings'
import { supabase } from '../lib/supabase'
import { InitialsBadge } from '../components/InitialsBadge'
import { AlertDialog } from '../components/AlertDialog'
import { Toggle } from '../components/Toggle'
import {
  ActivityIcon,
  ChevronLeftIcon,
  StoreIcon,
  UsersIcon,
  WhatsAppIcon,
} from '../components/icons'

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)
const rowCls =
  'flex items-center gap-[13px] rounded-[18px] bg-surface p-[14px] shadow-card transition active:scale-[0.99]'

// The tinted chip is how a row is recognised before it is read -- this screen
// is used by staff who are not reading four near-identical lines of text.
function Chip({ tint, children }: { tint: string; children: ReactNode }) {
  return (
    <span
      style={{ backgroundColor: tint }}
      className="flex h-[40px] w-[40px] shrink-0 items-center justify-center rounded-[13px]"
    >
      {children}
    </span>
  )
}

// The second line says what is behind the row. Without it the four rows are
// distinguishable only by a single word each.
function RowText({ title, sub }: { title: string; sub: string }) {
  return (
    <span className="min-w-0 flex-1">
      <span className="block truncate text-[14.5px] font-bold text-ink">{title}</span>
      <span className="mt-[2px] block truncate text-[11.5px] font-semibold text-muted">{sub}</span>
    </span>
  )
}

function Chevron() {
  return <span className="shrink-0 text-[#C0B4A2]">›</span>
}

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

  const waCount =
    counts === null
      ? 'Checking who has a phone number'
      : counts.withPhone === 0
        ? 'No customer has a phone number yet'
        : `${counts.on} of ${counts.withPhone} customers get bills`

  return (
    <div className="p-5 pb-[110px] pt-3">
      {/* navigate(-1), not a link to "/": this page is reached from both the
          commercial and the domestic side. But a deep link or a cold PWA
          launch can land here as the first history entry, where -1 leaves
          the app (or no-ops) -- fall back to "/" so the router can send the
          owner to the right segment instead. */}
      <button
        onClick={() => (window.history.state?.idx ? navigate(-1) : navigate('/'))}
        className="mb-4 inline-flex items-center gap-[6px] py-[6px] text-sm font-bold text-muted"
      >
        <ChevronLeftIcon size={18} /> Back
      </button>

      <div className="mb-7 flex items-center gap-[14px]">
        <InitialsBadge name={profile?.name ?? '?'} size={62} radius={20} />
        <div className="min-w-0">
          <p className="truncate font-display text-[23px] font-bold leading-[1.15] tracking-[-0.5px] text-ink">
            {profile?.name}
          </p>
          <p className="mt-[3px] truncate text-[12.5px] font-semibold text-muted">
            {data?.business_name || 'Cylinder Tracker'}
          </p>
          {profile && (
            <span className="mt-[7px] inline-block rounded-full bg-[#EDE7DA] px-[10px] py-[3px] text-[10.5px] font-bold uppercase tracking-[0.4px] text-muted">
              {cap(profile.role)}
              {profile.segment_access !== 'both' ? ` · ${cap(profile.segment_access)}` : ''}
            </span>
          )}
        </div>
      </div>

      <div className="space-y-[10px]">
        {isOwner && (
          <Link to="/commercial/reports" className={rowCls}>
            <Chip tint="#FBEDE4">
              <ActivityIcon size={19} color="#E4571B" strokeWidth={2.2} />
            </Chip>
            <RowText title="Reports" sub="Profit, margins and monthly totals" />
            <Chevron />
          </Link>
        )}
        {isOwner && (
          <Link to="/account/staff" className={rowCls}>
            <Chip tint="#E8EEF6">
              <UsersIcon size={19} color="#3B6EA5" strokeWidth={2.2} />
            </Chip>
            <RowText title="Staff" sub="Who can sign in, and what they can reach" />
            <Chevron />
          </Link>
        )}
        {/* Products and prices are edited from the Godown / Stock screen. */}
        <Link to="/account/business" className={rowCls}>
          <Chip tint="#EDE7DA">
            <StoreIcon size={19} color="#6E655A" strokeWidth={2.2} />
          </Chip>
          <RowText title="Business details" sub="Name, phone, address and GST number" />
          <Chevron />
        </Link>
        {/* The row does both: the switch covers everyone at once, the chevron
            opens the per-customer list. The switch swallows its own tap so
            flipping it does not also navigate. */}
        {isOwner && (
          <Link to="/account/whatsapp" className={rowCls}>
            <Chip tint="#EAF4EE">
              <WhatsAppIcon size={20} />
            </Chip>
            <RowText title="Push notifications" sub={waCount} />
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
                label="Send bills on WhatsApp to everyone with a phone number"
                onColor="#25D366"
              />
            </span>
            <Chevron />
          </Link>
        )}
      </div>

      <button
        onClick={signOut}
        className="mt-7 h-[52px] w-full rounded-[16px] border-[1.5px] border-borderMuted bg-surface text-[14.5px] font-bold transition active:scale-[0.99]"
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
