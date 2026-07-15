import { FormEvent, useEffect, useState } from 'react'
import { useNavigate, useParams, Link } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { supabase } from '../lib/supabase'
import { useCustomerBalances } from '../hooks/useCustomerBalances'
import { useProducts } from '../hooks/useProducts'
import { useCustomerProductBalances } from '../hooks/useCustomerProductBalances'
import { useTransactions } from '../hooks/useTransactions'
import { Stepper } from '../components/Stepper'
import { combineDateWithNow, dateInputValue, formatCurrency, todayInputValue } from '../utils/format'
import { ChevronLeftIcon } from '../components/icons'
import type { PaymentMethod } from '../types/db'

export function NewSale() {
  const { id, txId } = useParams()
  const navigate = useNavigate()
  const { session } = useAuth()
  const { data: customers } = useCustomerBalances()
  const { data: products } = useProducts()
  const { data: transactions } = useTransactions(id ? Number(id) : 0)
  const [customerId, setCustomerId] = useState<number | null>(id ? Number(id) : null)
  const { data: productBalances } = useCustomerProductBalances(customerId ?? 0)

  // Per-product line entry: a sale can include any product with qty > 0.
  const [qtyByProduct, setQtyByProduct] = useState<Record<number, number>>({})
  const [priceByProduct, setPriceByProduct] = useState<Record<number, string>>({})
  const [emptiesByProduct, setEmptiesByProduct] = useState<Record<number, number>>({})

  const [received, setReceived] = useState(false)
  const [method, setMethod] = useState<PaymentMethod>('cash')
  const [note, setNote] = useState('')
  const [date, setDate] = useState(todayInputValue())
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const [editProductId, setEditProductId] = useState<number | null>(null)
  const [originalEmpties, setOriginalEmpties] = useState(0)
  const [loadedEdit, setLoadedEdit] = useState(false)
  const editing = Boolean(txId)

  // Each size starts as a slim row; tapping "+ Add to sale" expands it into a
  // full entry line. In edit mode the single line is always expanded.
  const [expanded, setExpanded] = useState<Set<number>>(new Set())
  const expand = (pid: number) => setExpanded((s) => new Set(s).add(pid))
  const collapse = (pid: number) => {
    setExpanded((s) => {
      const n = new Set(s)
      n.delete(pid)
      return n
    })
    setQtyByProduct((s) => {
      const n = { ...s }
      delete n[pid]
      return n
    })
    setEmptiesByProduct((s) => {
      const n = { ...s }
      delete n[pid]
      return n
    })
    setPriceByProduct((s) => ({ ...s, [pid]: String(products.find((p) => p.id === pid)?.price || '') }))
  }

  useEffect(() => {
    if (customerId === null && customers.length > 0) setCustomerId(customers[0].id)
  }, [customers, customerId])

  useEffect(() => {
    if (editing) return
    setPriceByProduct((prev) => {
      const next = { ...prev }
      for (const p of products) if (next[p.id] === undefined) next[p.id] = String(p.price || '')
      return next
    })
  }, [products, editing])

  useEffect(() => {
    if (!editing || loadedEdit) return
    const tx = transactions.find((t) => t.id === Number(txId))
    if (!tx || tx.product_id === null) return
    setEditProductId(tx.product_id)
    setQtyByProduct({ [tx.product_id]: tx.qty })
    setEmptiesByProduct({ [tx.product_id]: tx.empties })
    setPriceByProduct({ [tx.product_id]: tx.qty > 0 ? String(tx.amount / tx.qty) : String(tx.amount) })
    setOriginalEmpties(tx.empties)
    setDate(dateInputValue(tx.created_at))
    setReceived(tx.paid)
    setMethod(tx.method ?? 'cash')
    setNote(tx.note ?? '')
    setLoadedEdit(true)
  }, [editing, loadedEdit, transactions, txId])

  const shownProducts = editing ? products.filter((p) => p.id === editProductId) : products

  const setQty = (pid: number, v: number) => setQtyByProduct((s) => ({ ...s, [pid]: v }))
  const setEmpties = (pid: number, v: number) => setEmptiesByProduct((s) => ({ ...s, [pid]: v }))
  const setPrice = (pid: number, v: string) => setPriceByProduct((s) => ({ ...s, [pid]: v }))

  function ownedFor(pid: number) {
    const bal = productBalances.find((b) => b.product_id === pid)?.empties_outstanding ?? 0
    return editing && pid === editProductId ? bal + originalEmpties : bal
  }

  const saleTotal = shownProducts.reduce(
    (sum, p) => sum + (qtyByProduct[p.id] ?? 0) * Number(priceByProduct[p.id] || 0),
    0,
  )

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!customerId) {
      setError('Select a customer')
      return
    }
    const lines = shownProducts
      .map((p) => ({
        productId: p.id,
        name: p.name,
        qty: qtyByProduct[p.id] ?? 0,
        price: Number(priceByProduct[p.id] || 0),
        empties: emptiesByProduct[p.id] ?? 0,
      }))
      .filter((l) => l.qty > 0)

    if (lines.length === 0) {
      setError('Enter a quantity for at least one product')
      return
    }
    for (const l of lines) {
      if (l.price <= 0) {
        setError(`Enter a price for ${l.name}`)
        return
      }
      const cap = ownedFor(l.productId) + l.qty
      if (l.empties > cap) {
        setError(`Empties taken for ${l.name} can't exceed ${cap} (${ownedFor(l.productId)} owed + ${l.qty} this sale).`)
        return
      }
    }

    setSaving(true)
    setError(null)
    const timestamp = combineDateWithNow(date)

    if (editing && editProductId !== null) {
      const l = lines[0]
      const { error } = await supabase
        .from('transactions')
        .update({
          qty: l.qty,
          empties: l.empties,
          amount: l.qty * l.price,
          paid: received,
          method: received ? method : null,
          note: note.trim() || null,
          created_at: timestamp,
          updated_by: session?.user.id,
        })
        .eq('id', Number(txId))
      setSaving(false)
      if (error) {
        setError(error.message)
        return
      }
      navigate(`/customers/${customerId}`)
      return
    }

    const rows = lines.map((l) => ({
      customer_id: customerId,
      type: 'sale' as const,
      product_id: l.productId,
      qty: l.qty,
      empties: l.empties,
      amount: l.qty * l.price,
      paid: received,
      method: received ? method : null,
      note: note.trim() || null,
      created_by: session?.user.id,
      created_at: timestamp,
    }))
    const { error } = await supabase.from('transactions').insert(rows)
    setSaving(false)
    if (error) {
      setError(error.message)
      return
    }
    navigate(`/customers/${customerId}`)
  }

  const fieldLabel = 'mb-[7px] text-[11px] font-bold uppercase tracking-[0.5px] text-muted'
  const fieldInput = 'h-[50px] w-full rounded-[14px] border border-borderMuted bg-cream px-[14px] font-bold text-ink'
  const segBtn = (active: boolean) =>
    `flex-1 rounded-[12px] py-[11px] text-[13.5px] font-bold transition ${
      active ? 'bg-gradient-to-br from-accentSoft to-accent text-white shadow-glow' : 'text-muted'
    }`

  return (
    <div className="p-5 pb-10 pt-3">
      <Link to={customerId ? `/customers/${customerId}` : '/'} className="mb-3 inline-flex items-center gap-[6px] py-[6px] text-sm font-bold text-muted">
        <ChevronLeftIcon size={18} /> Back
      </Link>
      <h1 className="mb-[18px] font-display text-[26px] font-bold tracking-[-0.5px] text-ink">{editing ? 'Edit sale' : 'Record a sale'}</h1>

      <form onSubmit={handleSubmit}>
        <div className="rounded-[24px] bg-surface p-5 shadow-card">
          <div className="mb-4 flex gap-3">
            <div className="flex-1">
              <p className={fieldLabel}>Customer</p>
              <select
                value={customerId ?? ''}
                onChange={(e) => setCustomerId(Number(e.target.value))}
                disabled={editing}
                className={`${fieldInput} appearance-none disabled:opacity-60`}
              >
                {customers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex-1">
              <p className={fieldLabel}>Date</p>
              <input
                type="date"
                value={date}
                max={todayInputValue()}
                onChange={(e) => setDate(e.target.value)}
                className={fieldInput}
              />
            </div>
          </div>

          {!editing && (
            <p className="mb-3 text-[12px] font-semibold text-subtle">Tap a size to add it to the sale.</p>
          )}

          {shownProducts.map((p, i) => {
            const isOpen = editing || expanded.has(p.id)
            const qty = qtyByProduct[p.id] ?? 0
            const lineTotal = qty * Number(priceByProduct[p.id] || 0)
            return (
              <div key={p.id} className={i > 0 ? 'mt-[10px]' : ''}>
                {!isOpen ? (
                  <button
                    type="button"
                    onClick={() => expand(p.id)}
                    className="flex w-full items-center justify-between rounded-[14px] bg-cream px-4 py-[13px]"
                  >
                    <span className="inline-block rounded-lg bg-ink px-[10px] py-[4px] font-display text-[13px] font-bold text-white">
                      {p.name}
                    </span>
                    <span className="text-[13px] font-bold text-accent">+ Add to sale</span>
                  </button>
                ) : (
                  <div className="rounded-[16px] bg-cream p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="inline-block rounded-lg bg-ink px-[10px] py-[4px] font-display text-[13px] font-bold text-white">
                          {p.name}
                        </span>
                        {qty > 0 && (
                          <span className="text-[11px] font-bold text-muted">
                            ×{qty} · {formatCurrency(lineTotal)}
                          </span>
                        )}
                      </div>
                      {!editing && (
                        <button
                          type="button"
                          onClick={() => collapse(p.id)}
                          aria-label={`Remove ${p.name}`}
                          className="-mr-1 flex h-9 w-9 items-center justify-center rounded-full text-[22px] font-bold leading-none text-muted active:scale-95"
                        >
                          ×
                        </button>
                      )}
                    </div>
                    <div className="mt-3 flex gap-3">
                      <div className="min-w-0 flex-1">
                        <p className={fieldLabel}>Sold</p>
                        <Stepper value={qtyByProduct[p.id] ?? 0} onChange={(v) => setQty(p.id, v)} min={editing ? 1 : 0} tone="surface" size="sm" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className={fieldLabel}>Empties taken</p>
                        <Stepper value={emptiesByProduct[p.id] ?? 0} onChange={(v) => setEmpties(p.id, v)} min={0} variant="secondary" tone="surface" size="sm" />
                      </div>
                    </div>
                    <div className="mt-3">
                      <p className={fieldLabel}>Price each (₹)</p>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={priceByProduct[p.id] ?? ''}
                        onChange={(e) => setPrice(p.id, e.target.value)}
                        className={`${fieldInput} !bg-surface`}
                      />
                    </div>
                    <p className="mt-2 text-[12px] font-semibold text-muted">
                      Customer owes <span className="font-bold text-[#C23B22]">{ownedFor(p.id)}</span> {p.name} empties
                    </p>
                  </div>
                )}
              </div>
            )
          })}

          <div className="mt-5 border-t border-borderMuted pt-4">
            <p className={fieldLabel}>Payment</p>
            <div className="flex gap-2 rounded-[14px] bg-cream p-[5px]">
              <button type="button" onClick={() => setReceived(false)} className={segBtn(!received)}>
                On credit
              </button>
              <button type="button" onClick={() => setReceived(true)} className={segBtn(received)}>
                Received now
              </button>
            </div>
          </div>

          {received && (
            <>
              <div className="mt-4">
                <p className={fieldLabel}>Payment method</p>
                <div className="flex gap-2 rounded-[14px] bg-cream p-[5px]">
                  <button type="button" onClick={() => setMethod('cash')} className={segBtn(method === 'cash')}>
                    Cash
                  </button>
                  <button type="button" onClick={() => setMethod('upi')} className={segBtn(method === 'upi')}>
                    UPI
                  </button>
                </div>
              </div>
              <div className="mt-4">
                <p className={fieldLabel}>Note (optional)</p>
                <input
                  placeholder="e.g. Paid via GPay"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  className={`${fieldInput} font-semibold`}
                />
              </div>
            </>
          )}
        </div>

        <div className="mt-4 flex items-end justify-between rounded-[20px] bg-gradient-to-br from-[#FBEDE4] to-[#F7DFC9] p-5">
          <span className="text-[13px] font-bold uppercase tracking-[0.5px] text-[#9A6A4A]">Sale total</span>
          <span className="font-display text-[30px] font-bold leading-none text-ink">{formatCurrency(saleTotal)}</span>
        </div>

        {error && <p className="mt-4 text-sm font-semibold text-red-600">{error}</p>}
        <button
          type="submit"
          disabled={saving}
          className="mt-4 h-[56px] w-full rounded-[16px] bg-gradient-to-br from-accentSoft to-accent text-[15px] font-bold text-white shadow-glow transition active:scale-[0.99] disabled:opacity-50"
        >
          {saving ? 'Saving…' : editing ? 'Save changes' : 'Save sale'}
        </button>
      </form>
    </div>
  )
}
