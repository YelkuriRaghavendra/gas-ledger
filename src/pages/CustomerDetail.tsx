import { FormEvent, useState } from 'react'
import { useNavigate, useParams, Link } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { supabase } from '../lib/supabase'
import { useCustomerBalance } from '../hooks/useCustomerBalance'
import { useTransactions } from '../hooks/useTransactions'
import { formatCurrency, formatDate, formatRelativeDate } from '../utils/format'
import { getActivityIcon, getActivityTint } from '../utils/activityIcon'
import { isValidPhone, sanitizePhoneInput } from '../utils/validation'
import { Avatar } from '../components/Avatar'
import { HeroCard } from '../components/HeroCard'
import { BottomSheet } from '../components/BottomSheet'
import { ChevronLeftIcon, PhoneIcon, MapPinIcon, PlusIcon, ReturnIcon, CreditCardIcon } from '../components/icons'
import type { Transaction } from '../types/db'

type HistoryEntry = Transaction & { balanceAfter: number }

interface HistoryGroup {
  key: string
  label: string
  entries: HistoryEntry[]
  sales: number
  returns: number
  collected: number
}

function historyTitle(t: Transaction) {
  if (t.type === 'sale') return `${t.qty} cylinders sold`
  if (t.type === 'return') return `${t.qty} empties returned`
  return 'Payment received'
}

function historySubtitle(t: Transaction) {
  const date = formatRelativeDate(t.created_at)
  if (t.type === 'sale') {
    const empties = t.empties ? ` · ${t.empties} empties collected` : ''
    const paid = t.paid ? ` · Paid${t.method ? ` (${t.method === 'upi' ? 'UPI' : 'Cash'})` : ''}` : ''
    return `${date} · ${formatCurrency(t.amount)}${empties}${paid}`
  }
  if (t.type === 'payment') {
    const method = t.method ? ` · ${t.method === 'upi' ? 'UPI' : 'Cash'}` : ''
    return `${date} · ${formatCurrency(t.amount)}${method}`
  }
  return date
}

function historyAmount(t: Transaction) {
  if (t.type === 'sale') return `+${t.qty}`
  if (t.type === 'return') return `−${t.qty}`
  return formatCurrency(t.amount)
}

function transactionEditPath(t: Transaction) {
  return `/customers/${t.customer_id}/${t.type}/${t.id}/edit`
}

function dayKey(iso: string) {
  const d = new Date(iso)
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`
}

function buildHistoryGroups(transactions: Transaction[]): HistoryGroup[] {
  const chronological = [...transactions].reverse()
  let running = 0
  const withBalance: HistoryEntry[] = chronological.map((t) => {
    if (t.type === 'sale' && !t.paid) running += t.amount
    else if (t.type === 'payment') running -= t.amount
    return { ...t, balanceAfter: running }
  })
  const newestFirst = [...withBalance].reverse()

  const groups: HistoryGroup[] = []
  for (const t of newestFirst) {
    const key = dayKey(t.created_at)
    let group = groups.find((g) => g.key === key)
    if (!group) {
      group = { key, label: formatRelativeDate(t.created_at), entries: [], sales: 0, returns: 0, collected: 0 }
      groups.push(group)
    }
    group.entries.push(t)
    if (t.type === 'sale') group.sales += 1
    if (t.type === 'return') group.returns += 1
    if (t.type === 'payment') group.collected += t.amount
    if (t.type === 'sale' && t.paid) group.collected += t.amount
  }
  return groups
}

function digestLine(group: HistoryGroup) {
  const parts: string[] = []
  if (group.sales > 0) parts.push(`${group.sales} sale${group.sales > 1 ? 's' : ''}`)
  if (group.returns > 0) parts.push(`${group.returns} return${group.returns > 1 ? 's' : ''}`)
  if (group.collected > 0) parts.push(`${formatCurrency(group.collected)} collected`)
  return parts.join(' · ')
}

export function CustomerDetail() {
  const { id } = useParams()
  const customerId = Number(id)
  const navigate = useNavigate()
  const { profile } = useAuth()
  const isOwner = profile?.role === 'owner'
  const { data: balance, loading, error, refresh: refreshBalance } = useCustomerBalance(customerId)
  const { data: transactions, refresh: refreshTx } = useTransactions(customerId)
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [address, setAddress] = useState('')
  const [startingEmpties, setStartingEmpties] = useState('')
  const [saving, setSaving] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)
  const [viewingTx, setViewingTx] = useState<HistoryEntry | null>(null)

  function startEdit() {
    if (!balance) return
    setName(balance.name)
    setPhone(balance.phone ?? '')
    setAddress(balance.address ?? '')
    setStartingEmpties(String(balance.starting_empties_owed))
    setEditing(true)
  }

  async function handleSave(e: FormEvent) {
    e.preventDefault()
    if (phone.trim() && !isValidPhone(phone)) {
      setActionError('Enter a valid 10-digit phone number')
      return
    }
    setSaving(true)
    setActionError(null)
    const { error } = await supabase
      .from('customers')
      .update({ name, phone, address, starting_empties_owed: Number(startingEmpties || 0) })
      .eq('id', customerId)
    setSaving(false)
    if (error) {
      setActionError(error.message)
      return
    }
    setEditing(false)
    refreshBalance()
  }

  async function handleDeleteCustomer() {
    if (!confirm('Delete this customer and all their transactions?')) return
    setActionError(null)
    const { error } = await supabase.from('customers').delete().eq('id', customerId)
    if (error) {
      setActionError(error.message)
      return
    }
    navigate('/customers')
  }

  async function handleDeleteTransaction(txId: number) {
    if (!confirm('Delete this entry?')) return
    setActionError(null)
    const { error } = await supabase.from('transactions').delete().eq('id', txId)
    if (error) {
      setActionError(error.message)
      return
    }
    refreshTx()
    refreshBalance()
  }

  if (loading) return <p className="p-4 text-muted">Loading…</p>
  if (error || !balance) return <p className="p-4 text-red-600">{error ?? 'Customer not found'}</p>

  const historyGroups = buildHistoryGroups(transactions)

  return (
    <div className="p-5 pb-10 pt-2">
      <Link to="/customers" className="mb-3 inline-flex items-center gap-[6px] py-[6px] text-sm font-bold text-muted">
        <ChevronLeftIcon size={18} /> Customers
      </Link>

      {actionError && <p className="mb-4 text-sm text-red-600">{actionError}</p>}

      {editing ? (
        <form onSubmit={handleSave} className="mb-[18px] space-y-3 rounded-2xl border border-[#EFE7D8] bg-white p-4">
          <input
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full rounded-[14px] border-[1.5px] border-borderMuted px-3 py-2 font-semibold text-ink"
          />
          <input
            inputMode="numeric"
            maxLength={10}
            value={phone}
            onChange={(e) => setPhone(sanitizePhoneInput(e.target.value))}
            className="w-full rounded-[14px] border-[1.5px] border-borderMuted px-3 py-2 font-semibold text-ink"
          />
          <input
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            className="w-full rounded-[14px] border-[1.5px] border-borderMuted px-3 py-2 font-semibold text-ink"
          />
          <div>
            <input
              type="number"
              min="0"
              placeholder="Empties already owed"
              value={startingEmpties}
              onChange={(e) => setStartingEmpties(e.target.value)}
              className="w-full rounded-[14px] border-[1.5px] border-borderMuted px-3 py-2 font-semibold text-ink"
            />
            <p className="mt-1 text-xs text-muted">Starting empties-owed balance (not from a sale in this app)</p>
          </div>
          <div className="flex gap-2">
            <button type="submit" disabled={saving} className="flex-1 rounded-[14px] bg-accent py-2 font-bold text-white">
              {saving ? 'Saving…' : 'Save'}
            </button>
            <button
              type="button"
              onClick={() => setEditing(false)}
              className="flex-1 rounded-[14px] border-[1.5px] border-borderMuted py-2 font-bold text-ink"
            >
              Cancel
            </button>
          </div>
        </form>
      ) : (
        <div className="mb-[18px] flex items-center gap-[14px]">
          <Avatar id={balance.id} name={balance.name} size={58} />
          <div className="min-w-0 flex-1">
            <h1 className="font-display text-xl font-bold leading-[1.1] tracking-[-0.3px] text-ink">{balance.name}</h1>
            <p className="mt-[3px] text-[13px] font-semibold text-muted">{balance.phone}</p>
          </div>
          {isOwner && (
            <div className="flex shrink-0 gap-3 text-xs font-bold">
              <button onClick={startEdit} className="text-accent">
                Edit
              </button>
              <button onClick={handleDeleteCustomer} className="text-red-600">
                Delete
              </button>
            </div>
          )}
        </div>
      )}

      <div className="mb-4 flex gap-2">
        {balance.phone && (
          <a
            href={`tel:${balance.phone}`}
            className="flex flex-1 items-center justify-center gap-[7px] rounded-[13px] border-[1.5px] border-borderMuted bg-white py-[11px] text-[13.5px] font-bold text-ink"
          >
            <PhoneIcon size={16} /> Call
          </a>
        )}
        {balance.address && (
          <a
            href={`https://maps.google.com/?q=${encodeURIComponent(balance.address)}`}
            target="_blank"
            rel="noreferrer"
            className="flex flex-1 items-center justify-center gap-[7px] overflow-hidden rounded-[13px] border-[1.5px] border-borderMuted bg-white py-[11px] text-[12.5px] font-semibold text-muted"
          >
            <MapPinIcon size={16} />
            <span className="truncate">{balance.address}</span>
          </a>
        )}
      </div>

      <HeroCard>
        <p className="mb-3 text-xs font-bold uppercase tracking-[0.5px] text-mutedOnDark">Empty cylinder balance</p>
        <div className="flex items-center gap-[10px]">
          <div className="flex-1 text-center">
            <p className="font-display text-[26px] font-bold text-white">{balance.sold}</p>
            <p className="mt-[2px] text-[11px] font-semibold text-mutedOnDark">Sold</p>
          </div>
          <span className="text-[22px] font-semibold text-[#6B6154]">−</span>
          <div className="flex-1 text-center">
            <p className="font-display text-[26px] font-bold text-[#5FCF97]">{balance.returned}</p>
            <p className="mt-[2px] text-[11px] font-semibold text-mutedOnDark">Returned</p>
          </div>
          <span className="text-[22px] font-semibold text-[#6B6154]">=</span>
          <div className="flex-1 rounded-[13px] bg-accent/[.18] px-1 py-2 text-center">
            <p className="font-display text-[26px] font-bold text-[#FF8A4C]">{balance.empties_outstanding}</p>
            <p className="mt-[2px] text-[11px] font-bold text-[#FF8A4C]/[.85]">Empties</p>
          </div>
        </div>
        <div className="mt-4 flex items-center justify-between border-t border-white/[.12] pt-[14px]">
          <span className="text-[13px] font-semibold text-[#C9BBA8]">Amount due</span>
          <span className="font-display text-xl font-bold text-[#FF8A4C]">{formatCurrency(balance.amount_due)}</span>
        </div>
      </HeroCard>

      <div className="my-[18px] grid grid-cols-3 gap-2">
        <Link
          to={`/customers/${customerId}/sale`}
          className="flex flex-col items-center gap-[5px] rounded-[13px] bg-accent py-3 text-[13px] font-bold text-white"
        >
          <PlusIcon size={18} strokeWidth={2.2} />
          Sale
        </Link>
        <Link
          to={`/customers/${customerId}/return`}
          className="flex flex-col items-center gap-[5px] rounded-[13px] border-[1.5px] border-borderMuted bg-white py-3 text-[13px] font-bold text-ink"
        >
          <ReturnIcon size={18} strokeWidth={2.2} />
          Return
        </Link>
        <Link
          to={`/customers/${customerId}/payment`}
          className="flex flex-col items-center gap-[5px] rounded-[13px] border-[1.5px] border-borderMuted bg-white py-3 text-[13px] font-bold text-ink"
        >
          <CreditCardIcon size={18} strokeWidth={2.2} />
          Payment
        </Link>
      </div>

      <h2 className="mb-3 font-display text-base font-semibold text-ink">History</h2>
      {historyGroups.map((group) => (
        <div key={group.key} className="mb-5">
          <div className="mb-2 flex items-baseline justify-between gap-2">
            <p className="text-xs font-bold uppercase tracking-[0.5px] text-muted">{group.label}</p>
            {digestLine(group) && <p className="text-xs font-medium text-[#9A8F80]">{digestLine(group)}</p>}
          </div>
          <ul className="flex flex-col gap-0">
            {group.entries.map((t) => {
              const tint = getActivityTint(t.type)
              return (
                <li key={t.id} className="flex gap-[14px] pb-[18px]">
                  <div
                    className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-[11px] text-[15px]"
                    style={{ backgroundColor: tint.bg, color: tint.color }}
                  >
                    {getActivityIcon(t.type)}
                  </div>
                  <div className="flex-1 pt-px">
                    <div className="flex items-baseline justify-between gap-2">
                      <p className="text-sm font-bold text-ink">{historyTitle(t)}</p>
                      <p className="font-display text-sm font-bold" style={{ color: tint.color }}>
                        {historyAmount(t)}
                      </p>
                    </div>
                    <p className="mt-[2px] text-xs font-semibold text-[#9A8F80]">{historySubtitle(t)}</p>
                    {t.note && <p className="mt-[1px] text-xs italic text-muted">{t.note}</p>}
                    <p className="mt-[1px] text-xs font-semibold text-muted">Balance: {formatCurrency(t.balanceAfter)}</p>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1 self-start">
                    <button onClick={() => setViewingTx(t)} className="text-xs font-bold text-ink">
                      View
                    </button>
                    {isOwner && (
                      <>
                        <Link to={transactionEditPath(t)} className="text-xs font-bold text-accent">
                          Edit
                        </Link>
                        <button onClick={() => handleDeleteTransaction(t.id)} className="text-xs font-bold text-red-600">
                          Delete
                        </button>
                      </>
                    )}
                  </div>
                </li>
              )
            })}
          </ul>
        </div>
      ))}
      {transactions.length === 0 && <p className="text-muted">No transactions yet.</p>}

      <BottomSheet open={viewingTx !== null} onClose={() => setViewingTx(null)}>
        {viewingTx && (
          <div>
            <h2 className="mb-4 font-display text-[19px] font-bold text-ink">{historyTitle(viewingTx)}</h2>
            <dl className="flex flex-col gap-3">
              <div className="flex justify-between border-b border-borderMuted pb-3">
                <dt className="text-[13px] font-semibold text-muted">Date &amp; time</dt>
                <dd className="text-[13px] font-bold text-ink">{formatDate(viewingTx.created_at)}</dd>
              </div>
              {viewingTx.type !== 'payment' && (
                <div className="flex justify-between border-b border-borderMuted pb-3">
                  <dt className="text-[13px] font-semibold text-muted">Cylinders</dt>
                  <dd className="text-[13px] font-bold text-ink">{viewingTx.qty}</dd>
                </div>
              )}
              {viewingTx.type === 'sale' && (
                <div className="flex justify-between border-b border-borderMuted pb-3">
                  <dt className="text-[13px] font-semibold text-muted">Empties collected</dt>
                  <dd className="text-[13px] font-bold text-ink">{viewingTx.empties}</dd>
                </div>
              )}
              {viewingTx.type !== 'return' && (
                <div className="flex justify-between border-b border-borderMuted pb-3">
                  <dt className="text-[13px] font-semibold text-muted">Amount</dt>
                  <dd className="text-[13px] font-bold text-ink">{formatCurrency(viewingTx.amount)}</dd>
                </div>
              )}
              {(viewingTx.type === 'payment' || viewingTx.paid) && (
                <div className="flex justify-between border-b border-borderMuted pb-3">
                  <dt className="text-[13px] font-semibold text-muted">Payment method</dt>
                  <dd className="text-[13px] font-bold text-ink">{viewingTx.method === 'upi' ? 'UPI' : 'Cash'}</dd>
                </div>
              )}
              {viewingTx.type === 'sale' && (
                <div className="flex justify-between border-b border-borderMuted pb-3">
                  <dt className="text-[13px] font-semibold text-muted">Payment status</dt>
                  <dd className="text-[13px] font-bold text-ink">{viewingTx.paid ? 'Paid' : 'On credit'}</dd>
                </div>
              )}
              {viewingTx.note && (
                <div className="flex justify-between border-b border-borderMuted pb-3">
                  <dt className="text-[13px] font-semibold text-muted">Note</dt>
                  <dd className="text-right text-[13px] font-bold text-ink">{viewingTx.note}</dd>
                </div>
              )}
              <div className="flex justify-between">
                <dt className="text-[13px] font-semibold text-muted">Balance after</dt>
                <dd className="text-[13px] font-bold text-ink">{formatCurrency(viewingTx.balanceAfter)}</dd>
              </div>
            </dl>
          </div>
        )}
      </BottomSheet>
    </div>
  )
}
