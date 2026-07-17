import { FormEvent, useState } from 'react'
import { useNavigate, useParams, Link } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { supabase } from '../lib/supabase'
import { useCustomerBalance } from '../hooks/useCustomerBalance'
import { useCustomerProductBalances } from '../hooks/useCustomerProductBalances'
import { useProducts } from '../hooks/useProducts'
import { useTransactions } from '../hooks/useTransactions'
import { useAgencySettings } from '../hooks/useAgencySettings'
import { useProfiles } from '../hooks/useProfiles'
import { formatCurrency, formatDate, formatRelativeDate, formatUpdated } from '../utils/format'
import { getActivityIcon, getActivityTint } from '../utils/activityIcon'
import { isValidPhone, sanitizePhoneInput } from '../utils/validation'
import { Avatar } from '../components/Avatar'
import { StatementDialog } from '../components/StatementDialog'
import { DetailModal } from '../components/DetailModal'
import { ChevronLeftIcon, PhoneIcon, MapPinIcon, ShareIcon } from '../components/icons'
import type { Transaction } from '../types/db'
import { HistoryEntry, HistoryGroup, historyTitle } from '../utils/statement'

function historyAmount(t: Transaction) {
  // Outright returns are cylinders the customer owns — they don't reduce
  // empties owed, so no misleading minus sign.
  if (t.type === 'return') return t.outright ? `${t.qty}` : `−${t.qty}`
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

function detailRows(t: HistoryEntry): { k: string; v: string }[] {
  const rows: { k: string; v: string }[] = []
  if (t.productName) rows.push({ k: 'Product', v: t.productName })
  if (t.type === 'sale') {
    rows.push({ k: 'Quantity sold', v: String(t.qty) })
    // Commercial outright sale = a New Connection (customer buys & keeps the
    // cylinder, no empty collected).
    if (t.outright) rows.push({ k: 'Type', v: 'New Connection' })
    else rows.push({ k: 'Empties collected', v: String(t.empties) })
    rows.push({ k: 'Payment', v: t.paid ? `Paid${t.method ? ` · ${t.method === 'upi' ? 'UPI' : 'Cash'}` : ''}` : 'On credit' })
  } else if (t.type === 'return') {
    rows.push({ k: 'Quantity', v: String(t.qty) })
    if (t.outright) rows.push({ k: 'Outright', v: 'Customer owns cylinder' })
  } else if (t.type === 'payment' && t.method) {
    rows.push({ k: 'Method', v: t.method === 'upi' ? 'UPI' : 'Cash' })
  }
  if (t.note) rows.push({ k: 'Note', v: t.note })
  rows.push({ k: 'Balance after', v: formatCurrency(t.balanceAfter) })
  return rows
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
  const { data: agencySettings } = useAgencySettings()
  const [editing, setEditing] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [statementOpen, setStatementOpen] = useState(false)
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [address, setAddress] = useState('')
  const [startingEmpties, setStartingEmpties] = useState('')
  const [startingEmptiesProductId, setStartingEmptiesProductId] = useState<number | null>(null)
  const [saving, setSaving] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)
  const [viewingTx, setViewingTx] = useState<HistoryEntry | null>(null)
  const profileNames = useProfiles()

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
    const { data: updated, error } = await supabase
      .from('customers')
      .update({
        name: name.trim(),
        phone: phone.trim() || null,
        address: address.trim() || null,
        starting_empties_owed: Number(startingEmpties || 0),
        starting_empties_product_id: startingEmptiesProductId,
      })
      .eq('id', customerId)
      .select()
      .single()
    setSaving(false)
    if (error) {
      setActionError(error.message)
      return
    }
    if (!updated) {
      setActionError('Update failed — you may not have permission to edit this customer.')
      return
    }
    setEditing(false)
    await Promise.all([refreshBalance(), refreshProductBalances()])
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
  const totalEmptiesOut = productBalances.reduce((sum, pb) => sum + pb.empties_outstanding, 0)

  // Outright sales are "New Connections"; outright returns are owned-cylinder
  // returns. customer_product_balances excludes outright, so derive these
  // per-product counts from the raw transactions.
  const ncByProduct = new Map<number, { sold: number; returned: number }>()
  for (const t of transactions) {
    if (!t.outright || t.product_id == null) continue
    const cur = ncByProduct.get(t.product_id) ?? { sold: 0, returned: 0 }
    if (t.type === 'sale') cur.sold += t.qty
    else if (t.type === 'return') cur.returned += t.qty
    ncByProduct.set(t.product_id, cur)
  }
  const agencyAddress = agencySettings
    ? [agencySettings.address_line1, agencySettings.address_line2, agencySettings.city, agencySettings.pincode].filter(Boolean).join(', ') ||
      agencySettings.business_address
    : null
  const agency = agencySettings
    ? { name: agencySettings.business_name, phone: agencySettings.business_phone, address: agencyAddress }
    : null

  return (
    <div className="p-5 pb-24 pt-2">
      <div className="mb-3 flex items-center justify-between">
        <Link to="/customers" className="inline-flex items-center gap-[6px] py-[6px] text-sm font-bold text-muted">
          <ChevronLeftIcon size={18} /> Customers
        </Link>
        {isOwner && !editing && (
          <div className="relative">
            <button
              type="button"
              onClick={() => setMenuOpen((v) => !v)}
              aria-label="More options"
              className="flex h-[34px] w-[34px] items-center justify-center rounded-[11px] bg-surface text-base font-bold leading-none text-ink shadow-card"
            >
              ⋯
            </button>
            {menuOpen && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
                <div className="absolute right-0 top-[42px] z-20 w-36 rounded-[14px] bg-surface p-1.5 shadow-float">
                  <button
                    type="button"
                    onClick={() => {
                      setMenuOpen(false)
                      startEdit()
                    }}
                    className="block w-full rounded-[10px] px-3 py-[9px] text-left text-sm font-bold text-ink"
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setMenuOpen(false)
                      handleDeleteCustomer()
                    }}
                    className="block w-full rounded-[10px] px-3 py-[9px] text-left text-sm font-bold text-red-600"
                  >
                    Delete
                  </button>
                </div>
              </>
            )}
          </div>
        )}
      </div>

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
            {(balance.address || balance.phone) && (
              <p className="mt-[3px] flex items-center gap-[4px] text-[12px] font-semibold text-muted">
                <MapPinIcon size={13} />
                <span className="truncate">{[balance.address, balance.phone].filter(Boolean).join(' · ')}</span>
              </p>
            )}
          </div>
        </div>
      )}

      <div className="mb-4 flex gap-[9px]">
        {balance.phone && (
          <a
            href={`tel:${balance.phone}`}
            className="flex flex-1 items-center justify-center gap-[6px] rounded-[14px] bg-surface py-[13px] text-[12.5px] font-bold text-ink shadow-card transition active:scale-[0.98]"
          >
            <PhoneIcon size={15} /> Call
          </a>
        )}
        {balance.address && (
          <a
            href={`https://maps.google.com/?q=${encodeURIComponent(balance.address)}`}
            target="_blank"
            rel="noreferrer"
            className="flex flex-1 items-center justify-center gap-[6px] rounded-[14px] bg-surface py-[13px] text-[12.5px] font-bold text-ink shadow-card transition active:scale-[0.98]"
          >
            <MapPinIcon size={15} /> Directions
          </a>
        )}
        <button
          type="button"
          onClick={() => setStatementOpen(true)}
          className="flex flex-1 items-center justify-center gap-[6px] rounded-[14px] bg-surface py-[13px] text-[12.5px] font-bold text-ink shadow-card transition active:scale-[0.98]"
        >
          <ShareIcon size={15} /> Statement
        </button>
      </div>

      <div className="mb-[18px] flex items-center justify-between rounded-[20px] bg-surface px-[18px] py-4 shadow-card">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.5px] text-subtle">Amount due</p>
          <p className="mt-[3px] font-display text-[25px] font-bold leading-none text-accent">{formatCurrency(balance.amount_due)}</p>
        </div>
        <div className="text-right">
          <p className="text-[10px] font-bold uppercase tracking-[0.4px] text-subtle">Empties out</p>
          <p className="mt-[2px] font-display text-[19px] font-bold text-[#2E8B57]">{totalEmptiesOut}</p>
        </div>
      </div>

      <h2 className="mb-3 text-[11px] font-extrabold uppercase tracking-[0.6px] text-subtle">By product</h2>
      <div className="grid grid-cols-2 gap-3">
        {productBalances.map((pb) => {
          const nc = ncByProduct.get(pb.product_id)
          return (
          <div key={pb.product_id} className="rounded-[18px] bg-surface p-[14px] shadow-card">
            <span className="inline-block rounded-[10px] bg-ink px-[10px] py-[4px] text-[11.5px] font-bold text-white">
              {pb.product_name}
            </span>
            <p className="mt-3 font-display text-[28px] font-bold leading-none text-[#F26B2C]">{pb.empties_outstanding}</p>
            <p className="mt-1 text-[10.5px] font-semibold text-subtle">empties owed</p>
            <div className="mt-[11px] flex gap-4 border-t border-borderMuted pt-[11px]">
              <div>
                <p className="font-display text-[16px] font-bold text-ink">{pb.sold}</p>
                <p className="mt-[2px] text-[10px] font-semibold text-subtle">sold</p>
              </div>
              <div>
                <p className="font-display text-[16px] font-bold text-[#2E8B57]">{pb.returned}</p>
                <p className="mt-[2px] text-[10px] font-semibold text-subtle">returned</p>
              </div>
            </div>
            {nc && (nc.sold > 0 || nc.returned > 0) && (
              <div className="mt-[9px] flex gap-4 border-t border-borderMuted pt-[9px]">
                <div>
                  <p className="font-display text-[16px] font-bold text-ink">{nc.sold}</p>
                  <p className="mt-[2px] text-[10px] font-semibold text-subtle">NC sold</p>
                </div>
                <div>
                  <p className="font-display text-[16px] font-bold text-ink">{nc.returned}</p>
                  <p className="mt-[2px] text-[10px] font-semibold text-subtle">outright ret</p>
                </div>
              </div>
            )}
          </div>
          )
        })}
      </div>

      <h2 className="mb-3 mt-6 font-display text-[18px] font-bold tracking-[-0.3px] text-ink">History</h2>
      {historyGroups.map((group) => (
        <div key={group.key} className="mb-5">
          <div className="mb-2 flex items-baseline justify-between gap-2 px-1">
            <p className="text-xs font-bold uppercase tracking-[0.5px] text-muted">{group.label}</p>
            {digestLine(group) && <p className="text-xs font-medium text-subtle">{digestLine(group)}</p>}
          </div>
          <ul className="flex flex-col gap-1 rounded-[18px] bg-surface p-2 shadow-card">
            {group.entries.map((t) => {
              const tint = getActivityTint(t.type)
              return (
                <li key={t.id}>
                  <button
                    type="button"
                    onClick={() => setViewingTx(t)}
                    className="flex w-full items-center gap-[13px] rounded-[14px] p-2 text-left transition active:bg-cream"
                  >
                    <div
                      className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[14px] text-lg"
                      style={{ backgroundColor: tint.bg, color: tint.color }}
                    >
                      {getActivityIcon(t.type)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-bold text-ink">{historyTitle(t, t.productName)}</p>
                      <p className="mt-[2px] truncate text-xs font-semibold text-[#9A8F80]">
                        {formatRelativeDate(t.created_at)}
                        {t.outright && t.type === 'sale' ? ' · New Connection' : ''}
                        {t.outright && t.type === 'return' ? ' · Outright' : ''}
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="font-display text-sm font-bold" style={{ color: tint.color }}>
                        {historyAmount(t)}
                      </p>
                      <p className="mt-[1px] text-xs font-semibold text-muted">Bal {formatCurrency(t.balanceAfter)}</p>
                    </div>
                    <span className="shrink-0 rotate-180">
                      <ChevronLeftIcon size={16} color="#B7AC9B" />
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
        </div>
      ))}
      {transactions.length === 0 && <p className="text-muted">No transactions yet.</p>}

      <StatementDialog
        open={statementOpen}
        onClose={() => setStatementOpen(false)}
        customerName={balance.name}
        amountDue={balance.amount_due}
        groups={historyGroups}
        customer={{ phone: balance.phone, address: balance.address }}
        agency={agency}
      />

      {viewingTx && (
        <DetailModal
          open={viewingTx !== null}
          onClose={() => setViewingTx(null)}
          icon={getActivityIcon(viewingTx.type)}
          iconBg={getActivityTint(viewingTx.type).bg}
          iconColor={getActivityTint(viewingTx.type).color}
          title={historyTitle(viewingTx, viewingTx.productName)}
          amount={historyAmount(viewingTx)}
          rows={detailRows(viewingTx)}
          created={formatDate(viewingTx.created_at)}
          createdBy={viewingTx.created_by ? profileNames.get(viewingTx.created_by) : undefined}
          updated={formatUpdated(viewingTx.updated_at, viewingTx.created_at)}
          updatedBy={viewingTx.updated_by ? profileNames.get(viewingTx.updated_by) : undefined}
          actions={
            isOwner ? (
              <>
                <Link
                  to={transactionEditPath(viewingTx)}
                  onClick={() => setViewingTx(null)}
                  className="flex h-[48px] flex-1 items-center justify-center rounded-[14px] bg-gradient-to-br from-accentSoft to-accent font-bold text-white shadow-glow transition active:scale-[0.99]"
                >
                  Edit
                </Link>
                <button
                  type="button"
                  onClick={() => {
                    const txId = viewingTx.id
                    setViewingTx(null)
                    handleDeleteTransaction(txId)
                  }}
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
