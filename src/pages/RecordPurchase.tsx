import { FormEvent, useEffect, useState } from 'react'
import { useNavigate, useParams, Link } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { supabase } from '../lib/supabase'
import { useProducts } from '../hooks/useProducts'
import { usePurchases } from '../hooks/usePurchases'
import { Stepper } from '../components/Stepper'
import { combineDateWithNow, dateInputValue, formatCurrency, todayInputValue } from '../utils/format'
import { ChevronLeftIcon } from '../components/icons'

export function RecordPurchase() {
  const { txId } = useParams()
  const navigate = useNavigate()
  const { session } = useAuth()
  const { data: products } = useProducts()
  const { data: purchases } = usePurchases()

  // A single bill can buy any number of sizes: qty received + price each per product.
  const [qtyByProduct, setQtyByProduct] = useState<Record<number, number>>({})
  const [emptiesByProduct, setEmptiesByProduct] = useState<Record<number, number>>({})
  const [matchEmptiesByProduct, setMatchEmptiesByProduct] = useState<Record<number, boolean>>({})
  const [priceByProduct, setPriceByProduct] = useState<Record<number, string>>({})
  const [date, setDate] = useState(todayInputValue())
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const [editProductId, setEditProductId] = useState<number | null>(null)
  const [loadedEdit, setLoadedEdit] = useState(false)
  const editing = Boolean(txId)

  // Prefill each size's price from the product default. Return prev unchanged
  // when nothing is added so the effect never triggers a redundant re-render.
  useEffect(() => {
    if (editing) return
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
  }, [products, editing])

  useEffect(() => {
    if (!editing || loadedEdit) return
    const purchase = purchases.find((p) => p.id === Number(txId))
    if (!purchase) return
    setEditProductId(purchase.product_id)
    setQtyByProduct({ [purchase.product_id]: purchase.qty })
    setEmptiesByProduct({ [purchase.product_id]: purchase.empties_given })
    setMatchEmptiesByProduct({ [purchase.product_id]: purchase.empties_given === purchase.qty })
    setPriceByProduct({ [purchase.product_id]: purchase.qty > 0 ? String(purchase.amount / purchase.qty) : String(purchase.amount) })
    setDate(dateInputValue(purchase.created_at))
    setLoadedEdit(true)
  }, [editing, loadedEdit, purchases, txId])

  const shownProducts = editing ? products.filter((p) => p.id === editProductId) : products

  const isMatched = (pid: number) => matchEmptiesByProduct[pid] ?? true
  const setQty = (pid: number, v: number) => {
    setQtyByProduct((s) => ({ ...s, [pid]: v }))
    if (isMatched(pid)) setEmptiesByProduct((s) => ({ ...s, [pid]: v }))
  }
  const setEmpties = (pid: number, v: number) => setEmptiesByProduct((s) => ({ ...s, [pid]: v }))
  const toggleMatch = (pid: number) => {
    const next = !isMatched(pid)
    setMatchEmptiesByProduct((s) => ({ ...s, [pid]: next }))
    if (next) setEmptiesByProduct((s) => ({ ...s, [pid]: qtyByProduct[pid] ?? 0 }))
  }
  const setPrice = (pid: number, v: string) => setPriceByProduct((s) => ({ ...s, [pid]: v }))

  const purchaseTotal = shownProducts.reduce(
    (sum, p) => sum + (qtyByProduct[p.id] ?? 0) * Number(priceByProduct[p.id] || 0),
    0,
  )

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    const lines = shownProducts
      .map((p) => ({
        productId: p.id,
        name: p.name,
        qty: qtyByProduct[p.id] ?? 0,
        empties: emptiesByProduct[p.id] ?? 0,
        price: Number(priceByProduct[p.id] || 0),
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
    }

    setSaving(true)
    setError(null)
    const timestamp = combineDateWithNow(date)

    if (editing && editProductId !== null) {
      const l = lines[0]
      const { error } = await supabase
        .from('purchases')
        .update({ qty: l.qty, empties_given: l.empties, amount: l.qty * l.price, created_at: timestamp, updated_by: session?.user.id })
        .eq('id', Number(txId))
      setSaving(false)
      if (error) {
        setError(error.message)
        return
      }
      navigate('/commercial/purchases')
      return
    }

    const rows = lines.map((l) => ({
      product_id: l.productId,
      qty: l.qty,
      empties_given: l.empties,
      amount: l.qty * l.price,
      paid: true,
      created_by: session?.user.id,
      created_at: timestamp,
    }))
    const { error } = await supabase.from('purchases').insert(rows)
    setSaving(false)
    if (error) {
      setError(error.message)
      return
    }
    navigate('/commercial/purchases')
  }

  const fieldLabel = 'mb-[7px] text-[11px] font-bold uppercase tracking-[0.5px] text-muted'
  const fieldInput = 'h-[50px] w-full rounded-[14px] border border-borderMuted bg-cream px-[14px] font-bold text-ink'

  return (
    <div className="p-5 pb-10 pt-3">
      <Link to="/commercial/purchases" className="mb-3 inline-flex items-center gap-[6px] py-[6px] text-sm font-bold text-muted">
        <ChevronLeftIcon size={18} /> Back
      </Link>
      <h1 className="mb-[18px] font-display text-[26px] font-bold tracking-[-0.5px] text-ink">
        {editing ? 'Edit purchase' : 'Record a purchase'}
      </h1>

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

          {!editing && (
            <p className="mb-3 text-[12px] font-semibold text-subtle">Enter quantity and price for each size bought.</p>
          )}

          <div className="space-y-3">
            {shownProducts.map((p) => {
              const qty = qtyByProduct[p.id] ?? 0
              const lineTotal = qty * Number(priceByProduct[p.id] || 0)
              return (
                <div key={p.id} className="rounded-[16px] bg-cream p-4">
                  <div className="flex items-center gap-2">
                    <span className="inline-block rounded-lg bg-ink px-[10px] py-[4px] font-display text-[13px] font-bold text-white">
                      {p.name}
                    </span>
                    {qty > 0 && (
                      <span className="text-[11px] font-bold text-muted">×{qty} · {formatCurrency(lineTotal)}</span>
                    )}
                  </div>
                  <div className="mt-3 flex gap-3">
                    <div className="min-w-0 flex-1">
                      <p className={fieldLabel}>Received</p>
                      <Stepper value={qty} onChange={(v) => setQty(p.id, v)} min={editing ? 1 : 0} tone="surface" size="sm" />
                    </div>
                    <div className={`min-w-0 flex-1 ${isMatched(p.id) ? 'opacity-50' : ''}`}>
                      <p className={fieldLabel}>Empties given</p>
                      <Stepper value={emptiesByProduct[p.id] ?? 0} onChange={(v) => setEmpties(p.id, v)} min={0} variant="secondary" tone="surface" size="sm" />
                    </div>
                  </div>
                  <label className="mt-2 flex cursor-pointer items-center gap-[8px] text-[12px] font-semibold text-muted">
                    <input
                      type="checkbox"
                      checked={isMatched(p.id)}
                      onChange={() => toggleMatch(p.id)}
                      className="h-[16px] w-[16px] accent-[#2E8B57]"
                    />
                    Match empties to received
                  </label>
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
                </div>
              )
            })}
          </div>
        </div>

        <div className="mt-4 flex items-end justify-between rounded-[20px] bg-gradient-to-br from-[#FBEDE4] to-[#F7DFC9] p-5">
          <span className="text-[13px] font-bold uppercase tracking-[0.5px] text-[#9A6A4A]">Purchase total</span>
          <span className="font-display text-[30px] font-bold leading-none text-ink">{formatCurrency(purchaseTotal)}</span>
        </div>

        {error && <p className="mt-4 text-sm font-semibold text-red-600">{error}</p>}
        <button
          type="submit"
          disabled={saving}
          className="mt-4 h-[56px] w-full rounded-[16px] bg-gradient-to-br from-accentSoft to-accent text-[15px] font-bold text-white shadow-glow transition active:scale-[0.99] disabled:opacity-50"
        >
          {saving ? 'Saving…' : editing ? 'Save changes' : 'Save purchase'}
        </button>
      </form>
    </div>
  )
}
