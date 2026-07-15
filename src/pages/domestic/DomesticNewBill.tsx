import { FormEvent, useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../../auth/AuthContext'
import { supabase } from '../../lib/supabase'
import { useProducts } from '../../hooks/useProducts'
import { useBundleComponents } from '../../hooks/useBundleComponents'
import { NewBillTable } from '../../components/NewBillTable'
import { combineDateWithNow, todayInputValue } from '../../utils/format'
import { ChevronLeftIcon } from '../../components/icons'

// One counter bill, many items. No customer, no credit — domestic
// sales are always settled on the spot. Payment method is not
// tracked at the till; the column is kept for reporting parity
// with commercial sales but is always null here.
export function DomesticNewBill() {
  const navigate = useNavigate()
  const { session } = useAuth()
  const { data: products } = useProducts('domestic')
  const { data: bundles } = useBundleComponents()

  const productNameById = new Map(products.map((p) => [p.id, p.name]))
  function comboHint(productId: number) {
    const parts = bundles
      .filter((b) => b.bundle_product_id === productId)
      .map((b) => `${b.qty} × ${productNameById.get(b.component_product_id) ?? 'item'}`)
    return parts.length > 0 ? `includes ${parts.join(', ')}` : null
  }

  const [qtyByProduct, setQtyByProduct] = useState<Record<number, number>>({})
  const [emptiesByProduct, setEmptiesByProduct] = useState<Record<number, number>>({})
  const [matchByProduct, setMatchByProduct] = useState<Record<number, boolean>>({})
  const [priceByProduct, setPriceByProduct] = useState<Record<number, string>>({})
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
      method: null,
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

  const fieldInput =
    'h-[38px] rounded-[12px] border border-borderMuted bg-surface px-[12px] text-[12.5px] font-bold text-ink shadow-card'

  return (
    <div className="p-5 pb-10 pt-3">
      <div className="mb-[14px] flex items-center justify-between">
        <Link
          to="/domestic"
          aria-label="Back"
          className="flex h-9 w-9 items-center justify-center rounded-[12px] bg-surface text-muted shadow-card"
        >
          <ChevronLeftIcon size={18} />
        </Link>
        <h1 className="font-display text-[20px] font-bold tracking-[-0.5px] text-ink">New bill</h1>
        <input
          type="date"
          value={date}
          max={todayInputValue()}
          onChange={(e) => setDate(e.target.value)}
          className={fieldInput}
        />
      </div>

      <form onSubmit={handleSubmit}>
        <NewBillTable
          products={products}
          qtyByProduct={qtyByProduct}
          priceByProduct={priceByProduct}
          emptiesByProduct={emptiesByProduct}
          onQty={setQty}
          onPrice={(pid, v) => setPriceByProduct((s) => ({ ...s, [pid]: v }))}
          onEmpties={(pid, v) => setEmptiesByProduct((s) => ({ ...s, [pid]: v }))}
          onToggleMatch={toggleMatch}
          isMatched={isMatched}
          comboHint={comboHint}
          billTotal={billTotal}
        />

        <div className="mt-4 flex h-[46px] items-center rounded-[14px] border border-borderMuted bg-surface px-[14px]">
          <input
            placeholder="Note (optional) — e.g. Delivery to 2nd street"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            className="w-full bg-transparent text-[12.5px] font-semibold text-ink placeholder:text-subtle focus:outline-none"
          />
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
