import { FormEvent, useState } from 'react'
import { useNavigate, useParams, Link } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { supabase } from '../lib/supabase'
import { useCustomerBalance } from '../hooks/useCustomerBalance'
import { useCustomerProductBalances } from '../hooks/useCustomerProductBalances'
import { useProducts } from '../hooks/useProducts'
import { useTransactions } from '../hooks/useTransactions'
import { useAgencySettings } from '../hooks/useAgencySettings'
import { formatCurrency, formatDate, formatRelativeDate } from '../utils/format'
import { getActivityIcon, getActivityTint } from '../utils/activityIcon'
import { isValidPhone, sanitizePhoneInput } from '../utils/validation'
import { Avatar } from '../components/Avatar'
import { BottomSheet } from '../components/BottomSheet'
import { ChevronLeftIcon, PhoneIcon, MapPinIcon, PlusIcon, ReturnIcon, CreditCardIcon, DownloadIcon, ShareIcon } from '../components/icons'
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

function formatHistoryText(
  customerName: string,
  phone: string | null,
  amountDue: number,
  productBalances: { product_name: string; empties_outstanding: number; sold: number; returned: number }[],
  groups: HistoryGroup[],
  agency: { name: string; phone: string | null; address: string | null } | null,
) {
  let text = ''
  if (agency) {
    text += `*${agency.name}*\n`
    if (agency.phone) text += `${agency.phone}\n`
    if (agency.address) text += `${agency.address}\n`
    text += `\n`
  }
  text += `*Customer statement — ${customerName}*\n`
  if (phone) text += `Phone: ${phone}\n`
  text += `\n*Balances:*\n`
  for (const pb of productBalances) {
    text += `  ${pb.product_name}: ${pb.empties_outstanding} empties owed (${pb.sold} sold, ${pb.returned} returned)\n`
  }
  text += `\n*Amount due: ${formatCurrency(amountDue)}*\n`

  const recentEntries = groups.flatMap((g) => g.entries).slice(0, 8)
  if (recentEntries.length > 0) {
    text += `\n*Recent transactions:*\n`
    for (const t of recentEntries) {
      const d = new Date(t.created_at)
      const dateStr = d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
      const title = historyTitle(t, t.productName)
      if (t.type === 'return') {
        text += `  ${dateStr} — ${title}\n`
      } else if (t.type === 'sale') {
        const pay = t.paid ? (t.method === 'upi' ? 'Paid, UPI' : 'Paid, Cash') : 'Credit'
        text += `  ${dateStr} — ${title} ${formatCurrency(t.amount)} (${pay})\n`
      } else {
        const method = t.method === 'upi' ? 'UPI' : 'Cash'
        text += `  ${dateStr} — ${title} ${formatCurrency(t.amount)} (${method})\n`
      }
    }
  }

  const now = new Date()
  text += `\nGenerated on ${now.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}`
  return text
}

function esc(s: string) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function generatePdfHtml(
  customerName: string,
  phone: string | null,
  address: string | null,
  amountDue: number,
  groups: HistoryGroup[],
  agency: { name: string; phone: string | null; address: string | null } | null,
) {
  const rows = groups
    .flatMap((g) =>
      g.entries.map(
        (t, i) => {
          const bg = i % 2 === 0 ? '#FAFAF7' : '#fff'
          const typeLabel = t.type === 'sale' ? 'Sale' : t.type === 'return' ? 'Return' : 'Payment'
          const typeBg = t.type === 'sale' ? '#FFF3ED' : t.type === 'return' ? '#EDF7F1' : '#EDF2F7'
          const typeColor = t.type === 'sale' ? '#C24B1A' : t.type === 'return' ? '#1D7A4A' : '#3B6EA5'
          return `<tr style="background:${bg}">
            <td style="padding:10px 12px;font-size:12px;color:#6B5E50">${esc(formatDate(t.created_at))}</td>
            <td style="padding:10px 12px">
              <span style="display:inline-block;background:${typeBg};color:${typeColor};font-size:10px;font-weight:700;padding:2px 8px;border-radius:4px;letter-spacing:0.3px">${typeLabel}</span>
              <span style="margin-left:8px;font-size:13px;font-weight:600;color:#1F1813">${esc(historyTitle(t, t.productName))}</span>
            </td>
            <td style="padding:10px 12px;text-align:right;font-size:13px;font-weight:600;color:#1F1813">${t.type !== 'return' ? formatCurrency(t.amount) : '—'}</td>
            <td style="padding:10px 12px;text-align:right;font-size:13px;font-weight:600;color:#6B5E50">${formatCurrency(t.balanceAfter)}</td>
          </tr>`
        },
      ),
    )
    .join('')

  const now = new Date()
  const dateStr = now.toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })

  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${esc(customerName)} — Statement</title>
<style>
  *{margin:0;padding:0;box-sizing:border-box}
  body{font-family:-apple-system,'Segoe UI',system-ui,sans-serif;max-width:640px;margin:0 auto;padding:32px 24px;color:#1F1813;background:#fff}
  @media print{body{padding:16px}@page{margin:12mm 10mm}}
</style></head><body>
<div style="text-align:center;margin-bottom:20px;padding-bottom:18px;border-bottom:2px solid #1F1813">
  <div style="font-size:20px;font-weight:800;color:#1F1813;letter-spacing:-0.3px">${esc(agency?.name || 'Cylinder Tracker')}</div>
  ${agency?.phone ? `<div style="font-size:13px;color:#6B5E50;margin-top:4px">${esc(agency.phone)}</div>` : ''}
  ${agency?.address ? `<div style="font-size:13px;color:#6B5E50;margin-top:2px">${esc(agency.address)}</div>` : ''}
</div>

<div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:20px">
  <div>
    <div style="font-size:18px;font-weight:700;color:#1F1813">${esc(customerName)}</div>
    ${phone ? `<div style="font-size:13px;color:#6B5E50;margin-top:3px">${esc(phone)}</div>` : ''}
    ${address ? `<div style="font-size:13px;color:#6B5E50;margin-top:2px">${esc(address)}</div>` : ''}
  </div>
  <div style="text-align:right">
    <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;color:#8B7E6E">Amount due</div>
    <div style="font-size:26px;font-weight:800;color:#E4571B;line-height:1.1">${formatCurrency(amountDue)}</div>
  </div>
</div>

<table style="width:100%;border-collapse:collapse">
  <thead>
    <tr style="border-bottom:2px solid #E0D8CC">
      <th style="padding:8px 12px;text-align:left;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;color:#8B7E6E">Date</th>
      <th style="padding:8px 12px;text-align:left;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;color:#8B7E6E">Description</th>
      <th style="padding:8px 12px;text-align:right;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;color:#8B7E6E">Amount</th>
      <th style="padding:8px 12px;text-align:right;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;color:#8B7E6E">Balance</th>
    </tr>
  </thead>
  <tbody>${rows}</tbody>
</table>

<div style="margin-top:24px;padding-top:16px;border-top:1px solid #E0D8CC;text-align:center">
  <span style="font-size:11px;color:#B0A898">${dateStr}</span>
</div>
</body></html>`
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

  function handleDownloadPdf() {
    if (!balance) return
    const agency = agencySettings ? { name: agencySettings.business_name, phone: agencySettings.business_phone, address: agencySettings.business_address } : null
    const html = generatePdfHtml(balance.name, balance.phone, balance.address, balance.amount_due, historyGroups, agency)
    const blob = new Blob([html], { type: 'text/html' })
    const url = URL.createObjectURL(blob)
    const win = window.open(url, '_blank')
    if (win) setTimeout(() => { win.print(); URL.revokeObjectURL(url) }, 600)
    else URL.revokeObjectURL(url)
  }

  function handleShareWhatsApp() {
    if (!balance) return
    const agency = agencySettings ? { name: agencySettings.business_name, phone: agencySettings.business_phone, address: agencySettings.business_address } : null
    const text = formatHistoryText(balance.name, balance.phone, balance.amount_due, productBalances, historyGroups, agency)
    window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(text)}`, '_blank')
  }

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

      <div className="mt-3 flex gap-2">
        <button
          type="button"
          onClick={handleDownloadPdf}
          className="flex flex-1 items-center justify-center gap-[7px] rounded-[14px] bg-surface py-[12px] text-[13px] font-bold text-ink shadow-card transition active:scale-[0.98]"
        >
          <DownloadIcon size={16} /> Download PDF
        </button>
        <button
          type="button"
          onClick={handleShareWhatsApp}
          className="flex flex-1 items-center justify-center gap-[7px] rounded-[14px] bg-[#25D366] py-[12px] text-[13px] font-bold text-white shadow-card transition active:scale-[0.98]"
        >
          <ShareIcon size={16} color="#fff" /> WhatsApp
        </button>
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
                      <div className="flex items-baseline justify-between gap-2">
                        <p className="truncate text-sm font-bold text-ink">{historyTitle(t, t.productName)}</p>
                        <p className="shrink-0 font-display text-sm font-bold" style={{ color: tint.color }}>
                          {historyAmount(t)}
                        </p>
                      </div>
                      <div className="mt-[2px] flex items-baseline justify-between gap-2">
                        <p className="truncate text-xs font-semibold text-[#9A8F80]">{historySubtitle(t)}</p>
                        <p className="shrink-0 text-xs font-semibold text-muted">Bal {formatCurrency(t.balanceAfter)}</p>
                      </div>
                      {t.note && <p className="mt-[1px] truncate text-xs italic text-muted">{t.note}</p>}
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
            {isOwner && (
              <div className="mt-5 flex gap-2">
                <Link
                  to={transactionEditPath(viewingTx)}
                  className="flex h-[48px] flex-1 items-center justify-center rounded-[14px] bg-gradient-to-br from-accentSoft to-accent font-bold text-white shadow-glow transition active:scale-[0.99]"
                >
                  Edit
                </Link>
                <button
                  type="button"
                  onClick={() => {
                    const id = viewingTx.id
                    setViewingTx(null)
                    handleDeleteTransaction(id)
                  }}
                  className="flex h-[48px] flex-1 items-center justify-center rounded-[14px] border-[1.5px] border-borderMuted bg-surface font-bold text-red-600 transition active:scale-[0.99]"
                >
                  Delete
                </button>
              </div>
            )}
          </div>
        )}
      </BottomSheet>
    </div>
  )
}
