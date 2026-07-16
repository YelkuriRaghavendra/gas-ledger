import { FormEvent, useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../../auth/AuthContext'
import { supabase } from '../../lib/supabase'
import { useProducts } from '../../hooks/useProducts'
import { Stepper } from '../../components/Stepper'
import { combineDateWithNow, formatCurrency, todayInputValue } from '../../utils/format'
import { ChevronLeftIcon } from '../../components/icons'

// Stock received from the plant/supplier — one bill, many items.
// Cylinders also record how many empties went back on the truck.
export function DomesticRecordPurchase() {
  const navigate = useNavigate()
  const { session } = useAuth()
  const { data: allProducts } = useProducts('domestic')
  const products = allProducts.filter((p) => p.kind !== 'service')

  const [qtyByProduct, setQtyByProduct] = useState<Record<number, number>>({})
  const [emptiesByProduct, setEmptiesByProduct] = useState<Record<number, number>>({})
  const [matchByProduct, setMatchByProduct] = useState<Record<number, boolean>>({})
  const [priceByProduct, setPriceByProduct] = useState<Record<number, string>>({})
  const [date, setDate] = useState(todayInputValue())
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    setPriceByProduct((prev) => {
      let changed = false
      const next = { ...prev }
      for (const p of products) {
        if (next[p.id] === undefined) {
          next[p.id] = ''
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

  const purchaseTotal = products.reduce(
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
      setError('Enter a quantity for at least one item')
      return
    }

    setSaving(true)
    setError(null)
    const billId = crypto.randomUUID()
    const timestamp = combineDateWithNow(date)
    const rows = lines.map((l) => ({
      product_id: l.product.id,
      qty: l.qty,
      empties_given: l.empties,
      amount: l.qty * l.price,
      paid: true,
      method: null,
      bill_id: billId,
      created_by: session?.user.id,
      created_at: timestamp,
    }))
    const { error } = await supabase.from('purchases').insert(rows)
    setSaving(false)
    if (error) {
      setError(error.message)
      return
    }
    navigate('/domestic/purchases')
  }

  const fieldLabel = 'mb-[7px] text-[11px] font-bold uppercase tracking-[0.5px] text-muted'
  const fieldInput = 'h-[50px] w-full rounded-[14px] border border-borderMuted bg-cream px-[14px] font-bold text-ink'

  return (
    <div className="p-5 pb-10 pt-3">
      <Link to="/domestic/purchases" className="mb-3 inline-flex items-center gap-[6px] py-[6px] text-sm font-bold text-muted">
        <ChevronLeftIcon size={18} /> Back
      </Link>
      <h1 className="mb-[18px] font-display text-[26px] font-bold tracking-[-0.5px] text-ink">Stock in</h1>

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

          <p className="mb-3 text-[12px] font-semibold text-subtle">
            Enter what arrived. Price is optional — leave blank for stock-only entries.
          </p>

          <div className="space-y-3">
            {products.map((p) => {
              const qty = qtyByProduct[p.id] ?? 0
              const lineTotal = qty * Number(priceByProduct[p.id] || 0)
              return (
                <div key={p.id} className="rounded-[16px] bg-cream p-4">
                  <div className="flex items-center gap-2">
                    <span className="text-[14px] font-bold text-ink">{p.name}</span>
                    {qty > 0 && lineTotal > 0 && (
                      <span className="text-[11px] font-bold text-muted">×{qty} · {formatCurrency(lineTotal)}</span>
                    )}
                  </div>
                  <div className="mt-3 flex gap-3">
                    <div className="min-w-0 flex-1">
                      <p className={fieldLabel}>Received</p>
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
                        <p className={fieldLabel}>Empties given back</p>
                        <Stepper
                          value={emptiesByProduct[p.id] ?? 0}
                          onChange={(v) => setEmptiesByProduct((s) => ({ ...s, [p.id]: v }))}
                          min={0}
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
                        Match empties to received
                      </label>
                    </>
                  )}
                </div>
              )
            })}
          </div>
        </div>

        <div className="mt-4 flex items-end justify-between rounded-[20px] bg-gradient-to-br from-[#EAF4EE] to-[#D9EDE1] p-5">
          <span className="text-[13px] font-bold uppercase tracking-[0.5px] text-[#3E7A57]">Purchase total</span>
          <span className="font-display text-[30px] font-bold leading-none text-[#2E8B57]">{formatCurrency(purchaseTotal)}</span>
        </div>

        {error && <p className="mt-4 text-sm font-semibold text-red-600">{error}</p>}
        <button
          type="submit"
          disabled={saving}
          className="mt-4 h-[56px] w-full rounded-[16px] bg-gradient-to-br from-[#3DA06A] to-[#2E8B57] text-[15px] font-bold text-white shadow-[0_12px_26px_-10px_rgba(46,139,87,0.65)] transition active:scale-[0.99] disabled:opacity-50"
        >
          {saving ? 'Saving…' : 'Save stock in'}
        </button>
      </form>
    </div>
  )
}
