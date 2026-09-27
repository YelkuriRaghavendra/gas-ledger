import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { useAgencySettings } from '../hooks/useAgencySettings'
import { supabase } from '../lib/supabase'
import { InitialsBadge } from '../components/InitialsBadge'
import { AlertDialog } from '../components/AlertDialog'
import { ChevronLeftIcon, WhatsAppIcon } from '../components/icons'

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)
const rowCls =
  'flex items-center justify-between rounded-[16px] bg-surface px-[18px] py-[17px] text-[14.5px] font-bold text-ink shadow-card'

export function Account() {
  const { profile, signOut } = useAuth()
  const { data } = useAgencySettings()
  const navigate = useNavigate()
  const isOwner = profile?.role === 'owner'
  const [confirmBulkEnable, setConfirmBulkEnable] = useState(false)
  const [enabling, setEnabling] = useState(false)
  const [alert, setAlert] = useState<string | null>(null)

  // Lives here rather than on the customer list because it is a one-off
  // settings action, not something done while working through customers. The
  // owner-only guard is cosmetic -- a trigger on customers rejects a
  // whatsapp_enabled change from anyone else.
  async function enableAllWithPhone() {
    setEnabling(true)
    const { error: updateError, count } = await supabase
      .from('customers')
      .update({ whatsapp_enabled: true }, { count: 'exact' })
      .not('phone', 'is', null)
      .eq('whatsapp_enabled', false)
    setEnabling(false)
    setConfirmBulkEnable(false)
    setAlert(
      updateError
        ? updateError.message
        : `WhatsApp enabled for ${count ?? 0} customer${count === 1 ? '' : 's'}`,
    )
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
        {isOwner && (
          <button
            type="button"
            onClick={() => setConfirmBulkEnable(true)}
            className={`${rowCls} w-full text-left transition active:scale-[0.99]`}
          >
            <span className="flex items-center gap-[10px]">
              <WhatsAppIcon size={18} />
              Enable WhatsApp for everyone with a phone
            </span>
          </button>
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
        open={confirmBulkEnable}
        onClose={() => setConfirmBulkEnable(false)}
        onConfirm={enableAllWithPhone}
        title="Enable WhatsApp for all customers?"
        message="Every customer with a phone number will start receiving bills on WhatsApp from their next bill onward."
        actionLabel={enabling ? 'Enabling…' : 'Enable'}
      />
      <AlertDialog open={alert !== null} onClose={() => setAlert(null)} title={alert ?? ''} />
    </div>
  )
}
