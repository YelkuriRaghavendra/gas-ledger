import { FormEvent, useState } from 'react'
import { useNavigate, useParams, Link } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { supabase } from '../lib/supabase'
import { useCustomerBalance } from '../hooks/useCustomerBalance'
import { useCustomerProductBalances } from '../hooks/useCustomerProductBalances'
import { useProducts } from '../hooks/useProducts'
import { useTransactions } from '../hooks/useTransactions'
import { formatCurrency, formatDate, formatRelativeDate } from '../utils/format'
import { getActivityIcon, getActivityTint } from '../utils/activityIcon'
import { isValidPhone, sanitizePhoneInput } from '../utils/validation'
import { Avatar } from '../components/Avatar'
import { BottomSheet } from '../components/BottomSheet'
import { ChevronLeftIcon, PhoneIcon, MapPinIcon, PlusIcon, ReturnIcon, CreditCardIcon } from '../components/icons'
import type { Transaction } from '../types/db'

type HistoryEntry = Transaction & { balanceAfter: number; productName: string | null }

interface HistoryGroup {
  key: string
  label: string
  entries: HistoryEntry[]
  sales: number
  returns: number
  collected: number
}

function historyTitle(t: Transaction, productName?: string | null) {
  if (t.type === 'sale') return productName ? `${t.qty} × ${productName} sold` : `${t.qty} cylinders sold`
  if (t.type === 'return') return productName ? `${t.qty} × ${productName} returned` : `${t.qty} empties returned`
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

function buildHistoryGroups(transactions: Transaction[], productNameById: Map<number, string>): HistoryGroup[] {
  const chronological = [...transactions].reverse()
  let running = 0
  const withBalance: HistoryEntry[] = chronological.map((t) => {
    if (t.type === 'sale' && !t.paid) running += t.amount
    else if (t.type === 'payment') running -= t.amount
    const productName = t.product_id !== null ? productNameById.get(t.product_id) ?? null : null
    return { ...t, balanceAfter: running, productName }
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
  const { data: productBalances, refresh: refreshProductBalances } = useCustomerProductBalances(customerId)
  const { data: products } = useProducts()
  const { data: transactions, refresh: refreshTx } = useTransactions(customerId)
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [address, setAddress] = useState('')
  const [startingEmpties, setStartingEmpties] = useState('')
  const [startingEmptiesProductId, setStartingEmptiesProductId] = useState<number | null>(null)
  const [saving, setSaving] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)
  const [viewingTx, setViewingTx] = useState<HistoryEntry | null>(null)

  const productNameById = new Map(products.map((p) => [p.id, p.name]))

  async function startEdit() {
    if (!balance) return
    setName(balance.name)
    setPhone(balance.phone ?? '')
    setAddress(balance.address ?? '')
    setStartingEmpties(String(balance.starting_empties_owed))
    const { data } = await supabase
      .from('customers')
      .select('starting_empties_product_id')
      .eq('id', customerId)
      .single()
    setStartingEmptiesProductId(data?.starting_empties_product_id ?? products[0]?.id ?? null)
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
      .update({
        name,
        phone,
        address,
        starting_empties_owed: Number(startingEmpties || 0),
        starting_empties_product_id: startingEmptiesProductId,
      })
      .eq('id', customerId)
    setSaving(false)
    if (error) {
      setActionError(error.message)
      return
    }
    setEditing(false)
    refreshBalance()
    refreshProductBalances()
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
    refreshProductBalances()
  }

  if (loading) return <p className="p-4 text-muted">Loading…</p>
  if (error || !balance) return <p className="p-4 text-red-600">{error ?? 'Customer not found'}</p>

  const historyGroups = buildHistoryGroups(transactions, productNameById)

  return (
    <div className="p-5 pb-10 pt-2">
      <Link to="/customers" className="mb-3 inline-flex items-center gap-[6px] py-[6px] text-sm font-bold text-muted">
        <ChevronLeftIcon size={18} /> Customers
      </Link>

      {actionError && <p className="mb-4 text-sm text-red-600">{actionError}</p>}

      {editing ? (
        <form onSubmit={handleSave} className="mb-[18px] space-y-3 rounded-[20px] bg-surface p-[18px] shadow-card">
          <input
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="h-[50px] w-full rounded-[14px] border-[1.5px] border-borderMuted bg-surface px-[14px] font-semibold text-ink"
          />
          <input
            inputMode="numeric"
            maxLength={10}
            value={phone}
            onChange={(e) => setPhone(sanitizePhoneInput(e.target.value))}
            className="h-[50px] w-full rounded-[14px] border-[1.5px] border-borderMuted bg-surface px-[14px] font-semibold text-ink"
          />
          <input
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            className="h-[50px] w-full rounded-[14px] border-[1.5px] border-borderMuted bg-surface px-[14px] font-semibold text-ink"
          />
          <div>
            <div className="flex gap-2">
              <input
                type="number"
                min="0"
                placeholder="Empties already owed"
                value={startingEmpties}
                onChange={(e) => setStartingEmpties(e.target.value)}
                className="w-full flex-1 rounded-[14px] border-[1.5px] border-borderMuted px-3 py-2 font-semibold text-ink"
              />
              <select
                value={startingEmptiesProductId ?? ''}
                onChange={(e) => setStartingEmptiesProductId(Number(e.target.value))}
                className="w-32 shrink-0 appearance-none rounded-[14px] border-[1.5px] border-borderMuted px-2 py-2 font-bold text-ink"
              >
                {products.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
            <p className="mt-1 text-xs text-muted">Starting empties-owed balance (not from a sale in this app)</p>
          </div>
          <div className="flex gap-2 pt-1">
            <button
              type="submit"
              disabled={saving}
              className="h-[48px] flex-1 rounded-[14px] bg-gradient-to-br from-accentSoft to-accent font-bold text-white shadow-glow transition active:scale-[0.99]"
            >
              {saving ? 'Saving…' : 'Save'}
            </button>
            <button
              type="button"
              onClick={() => setEditing(false)}
              className="h-[48px] flex-1 rounded-[14px] border-[1.5px] border-borderMuted bg-surface font-bold text-ink"
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
            className="flex flex-1 items-center justify-center gap-[7px] rounded-[14px] bg-surface py-[12px] text-[13.5px] font-bold text-ink shadow-card transition active:scale-[0.98]"
          >
            <PhoneIcon size={16} /> Call
          </a>
        )}
        {balance.address && (
          <a
            href={`https://maps.google.com/?q=${encodeURIComponent(balance.address)}`}
            target="_blank"
            rel="noreferrer"
            className="flex flex-1 items-center justify-center gap-[7px] overflow-hidden rounded-[14px] bg-surface py-[12px] text-[12.5px] font-semibold text-muted shadow-card transition active:scale-[0.98]"
          >
            <MapPinIcon size={16} />
            <span className="truncate">{balance.address}</span>
          </a>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3">
        {productBalances.map((pb) => (
          <div key={pb.product_id} className="rounded-[18px] bg-surface p-4 shadow-card">
            <span className="inline-block rounded-lg bg-ink px-[9px] py-[3px] font-display text-[12px] font-bold text-white">
              {pb.product_name}
            </span>
            <p className="mt-[14px] font-display text-[30px] font-bold leading-none text-[#F26B2C]">
              {pb.empties_outstanding}
            </p>
            <p className="mt-[4px] text-[11px] font-semibold text-subtle">empties owed</p>
            <div className="mt-[14px] flex gap-2 border-t border-borderMuted pt-[12px]">
              <div className="flex-1">
                <p className="font-display text-[17px] font-bold text-ink">{pb.sold}</p>
                <p className="text-[10.5px] font-semibold text-subtle">sold</p>
              </div>
              <div className="flex-1">
                <p className="font-display text-[17px] font-bold text-[#2E8B57]">{pb.returned}</p>
                <p className="text-[10.5px] font-semibold text-subtle">returned</p>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-3 flex items-center justify-between rounded-[18px] bg-gradient-to-br from-inkSoft to-ink px-[18px] py-4 text-white shadow-float">
        <span className="text-[13px] font-semibold text-[#C9BBA8]">Amount due</span>
        <span className="font-display text-[22px] font-bold text-[#FF8A4C]">{formatCurrency(balance.amount_due)}</span>
      </div>

      <div className="my-[18px] grid grid-cols-3 gap-3">
        <Link
          to={`/customers/${customerId}/sale`}
          className="flex flex-col items-center gap-[6px] rounded-[16px] bg-gradient-to-br from-accentSoft to-accent py-[14px] text-[13px] font-bold text-white shadow-glow transition active:scale-[0.97]"
        >
          <PlusIcon size={20} strokeWidth={2.3} />
          Sale
        </Link>
        <Link
          to={`/customers/${customerId}/return`}
          className="flex flex-col items-center gap-[6px] rounded-[16px] bg-surface py-[14px] text-[13px] font-bold text-ink shadow-card transition active:scale-[0.97]"
        >
          <ReturnIcon size={20} color="#2E8B57" strokeWidth={2.2} />
          Return
        </Link>
        <Link
          to={`/customers/${customerId}/payment`}
          className="flex flex-col items-center gap-[6px] rounded-[16px] bg-surface py-[14px] text-[13px] font-bold text-ink shadow-card transition active:scale-[0.97]"
        >
          <CreditCardIcon size={20} color="#3B6EA5" strokeWidth={2.2} />
          Payment
        </Link>
      </div>

      <h2 className="mb-3 font-display text-[18px] font-bold tracking-[-0.3px] text-ink">History</h2>
      {historyGroups.map((group) => (
        <div key={group.key} className="mb-5">
          <div className="mb-2 flex items-baseline justify-between gap-2 px-1">
            <p className="text-xs font-bold uppercase tracking-[0.5px] text-muted">{group.label}</p>
            {digestLine(group) && <p className="text-xs font-medium text-subtle">{digestLine(group)}</p>}
          </div>
          <ul className="flex flex-col gap-3 rounded-[18px] bg-surface p-[14px] shadow-card">
            {group.entries.map((t) => {
              const tint = getActivityTint(t.type)
              return (
                <li key={t.id} className="flex gap-[13px]">
                  <div
                    className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[14px] text-lg"
                    style={{ backgroundColor: tint.bg, color: tint.color }}
                  >
                    {getActivityIcon(t.type)}
                  </div>
                  <div className="flex-1 pt-px">
                    <div className="flex items-baseline justify-between gap-2">
                      <p className="text-sm font-bold text-ink">{historyTitle(t, t.productName)}</p>
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
            <h2 className="mb-4 font-display text-[19px] font-bold text-ink">{historyTitle(viewingTx, viewingTx.productName)}</h2>
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
