import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { AlertDialog } from '../components/AlertDialog'
import { Avatar } from '../components/Avatar'
import { Toggle } from '../components/Toggle'
import { ChevronLeftIcon, SearchIcon, WhatsAppIcon } from '../components/icons'

const WHATSAPP_GREEN = '#25D366'

interface Row {
  id: number
  name: string
  phone: string | null
  whatsapp_enabled: boolean
}

export function WhatsAppSettings() {
  const [rows, setRows] = useState<Row[] | null>(null)
  const [search, setSearch] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [alert, setAlert] = useState<string | null>(null)
  // Which direction the bulk switch was moved, or null when no dialog is open.
  // Nothing moves until the write lands, so cancelling leaves the list alone.
  const [pending, setPending] = useState<boolean | null>(null)
  const [working, setWorking] = useState(false)
  // Ids mid-write, so a row cannot be tapped twice into a race with itself.
  const [busy, setBusy] = useState<number[]>([])

  const load = useCallback(async () => {
    const { data, error: loadError } = await supabase
      .from('customers')
      .select('id, name, phone, whatsapp_enabled')
      .order('name')
    if (loadError) {
      setError(loadError.message)
      return
    }
    setError(null)
    setRows((data ?? []) as Row[])
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const withPhone = useMemo(() => (rows ?? []).filter((r) => r.phone), [rows])
  const withoutPhone = useMemo(() => (rows ?? []).filter((r) => !r.phone), [rows])
  const on = withPhone.filter((r) => r.whatsapp_enabled).length
  // On only when everyone who could receive a bill does. A partly-on list reads
  // as off, because that is the state the switch would change.
  const allOn = withPhone.length > 0 && on === withPhone.length

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return withPhone
    return withPhone.filter(
      (r) => r.name.toLowerCase().includes(q) || (r.phone ?? '').includes(q),
    )
  }, [withPhone, search])

  async function setOne(row: Row, next: boolean) {
    setBusy((b) => [...b, row.id])
    // Optimistic: the switch has to answer the thumb straight away on a phone.
    setRows((current) =>
      (current ?? []).map((r) => (r.id === row.id ? { ...r, whatsapp_enabled: next } : r)),
    )
    const { error: writeError } = await supabase
      .from('customers')
      .update({ whatsapp_enabled: next })
      .eq('id', row.id)
    setBusy((b) => b.filter((id) => id !== row.id))
    if (writeError) {
      // Put it back rather than leaving the screen claiming something untrue.
      setRows((current) =>
        (current ?? []).map((r) => (r.id === row.id ? { ...r, whatsapp_enabled: !next } : r)),
      )
      setAlert(writeError.message)
    }
  }

  async function applyToEveryone(next: boolean) {
    setWorking(true)
    const { error: writeError, count } = await supabase
      .from('customers')
      .update({ whatsapp_enabled: next }, { count: 'exact' })
      .not('phone', 'is', null)
      .eq('whatsapp_enabled', !next)
    setWorking(false)
    setPending(null)
    if (writeError) {
      setAlert(writeError.message)
    } else {
      setAlert(
        `WhatsApp turned ${next ? 'on' : 'off'} for ${count ?? 0} customer${count === 1 ? '' : 's'}`,
      )
    }
    void load()
  }

  const affected = pending ? withPhone.length - on : on

  return (
    <div className="p-4">
      <Link
        to="/account"
        className="mb-3 inline-flex items-center gap-[6px] py-[6px] text-sm font-bold text-muted"
      >
        <ChevronLeftIcon size={18} /> Account
      </Link>
      <h1 className="mb-4 font-display text-[24px] font-bold tracking-[-0.5px] text-ink">
        Push Notifications to WhatsApp
      </h1>

      {error && <p className="mb-3 text-sm font-semibold text-red-600">{error}</p>}
      {rows === null && !error && <p className="text-muted">Loading…</p>}

      {rows !== null && (
        <>
          <div className="mb-[18px] flex items-center justify-between rounded-[16px] bg-surface px-[18px] py-[17px] shadow-card">
            <span className="flex items-center gap-[10px] text-[14.5px] font-bold text-ink">
              <WhatsAppIcon size={18} />
              Everyone with a phone
            </span>
            <Toggle
              checked={allOn}
              onChange={(next) => setPending(next)}
              disabled={withPhone.length === 0}
              label="Push Notifications to WhatsApp for everyone with a phone number"
              onColor={WHATSAPP_GREEN}
            />
          </div>

          {withPhone.length > 0 && (
            <div className="relative mb-[14px]">
              <span className="pointer-events-none absolute left-[15px] top-1/2 -translate-y-1/2">
                <SearchIcon size={18} />
              </span>
              <input
                type="search"
                placeholder="Search name or phone"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="h-[52px] w-full rounded-[16px] border-[1.5px] border-borderMuted bg-surface pl-11 pr-4 font-semibold text-ink shadow-card"
              />
            </div>
          )}

          <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.5px] text-subtle">
            {on} of {withPhone.length} on
          </p>

          <ul className="flex flex-col gap-[10px]">
            {filtered.map((r) => (
              <li
                key={r.id}
                className="flex items-center gap-[13px] rounded-[18px] bg-surface p-[14px] shadow-card"
              >
                <Avatar id={r.id} name={r.name} size={42} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[14.5px] font-bold text-ink">{r.name}</p>
                  <p className="mt-[2px] truncate text-[11.5px] font-semibold text-muted">
                    {r.phone}
                  </p>
                </div>
                <Toggle
                  checked={r.whatsapp_enabled}
                  onChange={(next) => void setOne(r, next)}
                  disabled={busy.includes(r.id)}
                  label={`Push Notifications to WhatsApp for ${r.name}`}
                  onColor={WHATSAPP_GREEN}
                />
              </li>
            ))}
            {filtered.length === 0 && (
              <li className="rounded-[18px] bg-surface px-4 py-8 text-center text-sm font-medium text-subtle shadow-card">
                {search
                  ? 'No customers match your search'
                  : 'No customer has a phone number yet'}
              </li>
            )}
          </ul>

          {/* Listed rather than hidden: an owner who cannot find someone here
              needs to know it is a missing phone number, not a missing customer. */}
          {withoutPhone.length > 0 && (
            <>
              <p className="mb-2 mt-6 text-[11px] font-bold uppercase tracking-[0.5px] text-subtle">
                No phone number
              </p>
              <ul className="flex flex-col gap-[10px]">
                {withoutPhone.map((r) => (
                  <li
                    key={r.id}
                    className="flex items-center gap-[13px] rounded-[18px] bg-surface p-[14px] opacity-70 shadow-card"
                  >
                    <Avatar id={r.id} name={r.name} size={42} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[14.5px] font-bold text-ink">{r.name}</p>
                      <p className="mt-[2px] text-[11.5px] font-semibold text-muted">
                        Add a phone number to send bills
                      </p>
                    </div>
                    <Link
                      to={`/commercial/customers/${r.id}`}
                      className="shrink-0 text-[12.5px] font-bold text-accent"
                    >
                      Open
                    </Link>
                  </li>
                ))}
              </ul>
            </>
          )}
        </>
      )}

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
            : 'Nobody receives bills on WhatsApp after this. You can switch individual customers back on here.'
        }
        actionLabel={working ? 'Saving…' : pending ? 'Turn on' : 'Turn off'}
      />
      <AlertDialog open={alert !== null} onClose={() => setAlert(null)} title={alert ?? ''} />
    </div>
  )
}
