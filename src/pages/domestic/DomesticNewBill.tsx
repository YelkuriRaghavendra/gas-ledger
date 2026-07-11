import { FormEvent, useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../../auth/AuthContext'
import { supabase } from '../../lib/supabase'
import { useProducts } from '../../hooks/useProducts'
import { Stepper } from '../../components/Stepper'
import { combineDateWithNow, formatCurrency, todayInputValue } from '../../utils/format'
import { ChevronLeftIcon } from '../../components/icons'
import type { PaymentMethod, ProductKind } from '../../types/db'

const KIND_LABEL: Record<ProductKind, string> = {
  cylinder: 'Cylinders',
  accessory: 'Accessories',
  service: 'Services',
}

// One counter bill, many items. No customer, no credit — domestic
// sales are always settled on the spot (cash or UPI).
export function DomesticNewBill() {
  const navigate = useNavigate()
  const { session } = useAuth()
  const { data: products } = useProducts('domestic')

  const [qtyByProduct, setQtyByProduct] = useState<Record<number, number>>({})
  const [emptiesByProduct, setEmptiesByProduct] = useState<Record<number, number>>({})
  const [matchByProduct, setMatchByProduct] = useState<Record<number, boolean>>({})
  const [priceByProduct, setPriceByProduct] = useState<Record<number, string>>({})
  const [expanded, setExpanded] = useState<Set<number>>(new Set())
  const [method, setMethod] = useState<PaymentMethod>('cash')
  const [note, setNote] = useState('')
  const [date, setDate] = useState(todayInputValue())
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    setPriceByProduct((prev) => {
      let changed = false
      const next = { ...prev }
      for (const p of products) {
        if (next[p.id] === undefined) {
          next[p.id] = String(p.price || '')
          changed = true
        }
      }
      return changed ? next : prev
    })
  }, [products])

  const isMatched = (pid: number) => matchByProduct[pid] ?? true
  const setQty = (pid: number, v: number) => {
    setQtyByProduct((s) => ({ ...s, [pid]: v }))
    if (isMatched(pid)) setEmptiesByProduct((s) => ({ ...s, [pid]: v }))
  }
  const toggleMatch = (pid: number) => {
    const next = !isMatched(pid)
    setMatchByProduct((s) => ({ ...s, [pid]: next }))
    if (next) setEmptiesByProduct((s) => ({ ...s, [pid]: qtyByProduct[pid] ?? 0 }))
  }

  const expand = (pid: number) => setExpanded((s) => new Set(s).add(pid))
  const collapse = (pid: number) => {
    setExpanded((s) => {
      const n = new Set(s)
      n.delete(pid)
      return n
    })
    setQtyByProduct((s) => ({ ...s, [pid]: 0 }))
    setEmptiesByProduct((s) => ({ ...s, [pid]: 0 }))
    setPriceByProduct((s) => ({ ...s, [pid]: String(products.find((p) => p.id === pid)?.price || '') }))
  }

  const billTotal = products.reduce(
    (sum, p) => sum + (qtyByProduct[p.id] ?? 0) * Number(priceByProduct[p.id] || 0),
    0,
  )

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    const lines = products
      .map((p) => ({
        product: p,
        qty: qtyByProduct[p.id] ?? 0,
        price: Number(priceByProduct[p.id] || 0),
        empties: p.kind === 'cylinder' ? emptiesByProduct[p.id] ?? 0 : 0,
      }))
      .filter((l) => l.qty > 0)

    if (lines.length === 0) {
      setError('Add at least one item to the bill')
      return
    }
    for (const l of lines) {
      if (l.price < 0) {
        setError(`Enter a valid price for ${l.product.name}`)
        return
      }
    }

    setSaving(true)
    setError(null)
    const billId = crypto.randomUUID()
    const timestamp = combineDateWithNow(date)
    const rows = lines.map((l) => ({
      customer_id: null,
      type: 'sale' as const,
      product_id: l.product.id,
      qty: l.qty,
      empties: l.empties,
      amount: l.qty * l.price,
      paid: true,
      method,
      note: note.trim() || null,
      bill_id: billId,
      created_by: session?.user.id,
      created_at: timestamp,
    }))
    const { error } = await supabase.from('transactions').insert(rows)
    setSaving(false)
    if (error) {
      setError(error.message)
      return
    }
    navigate('/domestic')
  }

  const fieldLabel = 'mb-[7px] text-[11px] font-bold uppercase tracking-[0.5px] text-muted'
  const fieldInput = 'h-[50px] w-full rounded-[14px] border border-borderMuted bg-cream px-[14px] font-bold text-ink'
  const segBtn = (active: boolean) =>
    `flex-1 rounded-[12px] py-[11px] text-[13.5px] font-bold transition ${
      active ? 'bg-[#2E8B57] text-white shadow-[0_10px_22px_-10px_rgba(46,139,87,0.6)]' : 'text-muted'
    }`

  const kinds: ProductKind[] = ['cylinder', 'accessory', 'service']

  return (
    <div className="p-5 pb-10 pt-3">
      <Link to="/domestic" className="mb-3 inline-flex items-center gap-[6px] py-[6px] text-sm font-bold text-muted">
        <ChevronLeftIcon size={18} /> Back
      </Link>
      <h1 className="mb-[18px] font-display text-[26px] font-bold tracking-[-0.5px] text-ink">New bill</h1>

      <form onSubmit={handleSubmit}>
        <div className="rounded-[24px] bg-surface p-5 shadow-card">
          <div className="mb-4">
            <p className={fieldLabel}>Date</p>
            <input
              type="date"
              value={date}
              max={todayInputValue()}
              onChange={(e) => setDate(e.target.value)}
              className={fieldInput}
            />
          </div>

          <p className="mb-3 text-[12px] font-semibold text-subtle">Tap an item to add it to the bill.</p>

          {kinds.map((kind) => {
            const group = products.filter((p) => p.kind === kind)
            if (group.length === 0) return null
            return (
              <div key={kind} className="mb-4 last:mb-0">
                <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.5px] text-subtle">{KIND_LABEL[kind]}</p>
                <div className="space-y-[10px]">
                  {group.map((p) => {
                    const isOpen = expanded.has(p.id)
                    const qty = qtyByProduct[p.id] ?? 0
                    const lineTotal = qty * Number(priceByProduct[p.id] || 0)
                    if (!isOpen) {
                      return (
                        <button
                          key={p.id}
                          type="button"
                          onClick={() => expand(p.id)}
                          className="flex w-full items-center justify-between rounded-[14px] bg-cream px-4 py-[12px]"
                        >
                          <span className="text-[13.5px] font-bold text-ink">{p.name}</span>
                          <span className="text-[13px] font-bold text-[#2E8B57]">+ Add</span>
                        </button>
                      )
                    }
                    return (
                      <div key={p.id} className="rounded-[16px] bg-cream p-4">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className="text-[14px] font-bold text-ink">{p.name}</span>
                            {qty > 0 && (
                              <span className="text-[11px] font-bold text-muted">
                                ×{qty} · {formatCurrency(lineTotal)}
                              </span>
                            )}
                          </div>
                          <button
                            type="button"
                            onClick={() => collapse(p.id)}
                            aria-label={`Remove ${p.name}`}
                            className="-mr-1 flex h-9 w-9 items-center justify-center rounded-full text-[22px] font-bold leading-none text-muted active:scale-95"
                          >
                            ×
                          </button>
                        </div>
                        <div className="mt-3 flex gap-3">
                          <div className="min-w-0 flex-1">
                            <p className={fieldLabel}>Qty</p>
                            <Stepper value={qty} onChange={(v) => setQty(p.id, v)} min={0} variant="secondary" tone="surface" size="sm" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className={fieldLabel}>Price each (₹)</p>
                            <input
                              type="number"
                              min="0"
                              step="0.01"
                              value={priceByProduct[p.id] ?? ''}
                              onChange={(e) => setPriceByProduct((s) => ({ ...s, [p.id]: e.target.value }))}
                              className={`${fieldInput} !bg-surface`}
                            />
                          </div>
                        </div>
                        {p.kind === 'cylinder' && (
                          <>
                            <div className={`mt-3 ${isMatched(p.id) ? 'opacity-50' : ''}`}>
                              <p className={fieldLabel}>Empties taken</p>
                              <Stepper
                                value={emptiesByProduct[p.id] ?? 0}
                                onChange={(v) => setEmptiesByProduct((s) => ({ ...s, [p.id]: v }))}
                                min={0}
                                variant="secondary"
                                tone="surface"
                                size="sm"
                              />
                            </div>
                            <label className="mt-2 flex cursor-pointer items-center gap-[8px] text-[12px] font-semibold text-muted">
                              <input
                                type="checkbox"
                                checked={isMatched(p.id)}
                                onChange={() => toggleMatch(p.id)}
                                className="h-[16px] w-[16px] accent-[#2E8B57]"
                              />
                              Empty exchanged for each cylinder
                            </label>
                          </>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })}

          <div className="mt-5 border-t border-borderMuted pt-4">
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
              placeholder="e.g. Delivery to 2nd street"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className={`${fieldInput} font-semibold`}
            />
          </div>
        </div>

        <div className="mt-4 flex items-end justify-between rounded-[20px] bg-gradient-to-br from-[#EAF4EE] to-[#D9EDE1] p-5">
          <span className="text-[13px] font-bold uppercase tracking-[0.5px] text-[#3E7A57]">Bill total</span>
          <span className="font-display text-[30px] font-bold leading-none text-[#2E8B57]">{formatCurrency(billTotal)}</span>
        </div>

        {error && <p className="mt-4 text-sm font-semibold text-red-600">{error}</p>}
        <button
          type="submit"
          disabled={saving}
          className="mt-4 h-[56px] w-full rounded-[16px] bg-gradient-to-br from-[#3DA06A] to-[#2E8B57] text-[15px] font-bold text-white shadow-[0_12px_26px_-10px_rgba(46,139,87,0.65)] transition active:scale-[0.99] disabled:opacity-50"
        >
          {saving ? 'Saving…' : 'Save bill'}
        </button>
      </form>
    </div>
  )
}
