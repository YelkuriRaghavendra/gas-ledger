import { FormEvent, useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../../auth/AuthContext'
import { supabase } from '../../lib/supabase'
import { useProducts } from '../../hooks/useProducts'
import { useBundleComponents } from '../../hooks/useBundleComponents'
import { NewBillTable, type BillRow } from '../../components/NewBillTable'
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

  // A product with alternate prices becomes several rows (one per price);
  // a plain product is a single row. All bill state is keyed by row.key.
  const rows: BillRow[] = products.flatMap((p): BillRow[] => {
    const opts = p.price_options ?? []
    if (opts.length === 0) return [{ key: String(p.id), product: p, label: null, price: p.price }]
    return [
      { key: `${p.id}#d`, product: p, label: 'Default', price: p.price },
      ...opts.map((o, i) => ({ key: `${p.id}#${i}`, product: p, label: o.label, price: o.amount })),
    ]
  })

  const [qtyByKey, setQtyByKey] = useState<Record<string, number>>({})
  const [emptiesByKey, setEmptiesByKey] = useState<Record<string, number>>({})
  const [matchByKey, setMatchByKey] = useState<Record<string, boolean>>({})
  const [priceByKey, setPriceByKey] = useState<Record<string, string>>({})
  const [note, setNote] = useState('')
  const [date, setDate] = useState(todayInputValue())
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    setPriceByKey((prev) => {
      let changed = false
      const next = { ...prev }
      for (const r of rows) {
        if (next[r.key] === undefined) {
          next[r.key] = String(r.price || '')
          changed = true
        }
      }
      return changed ? next : prev
    })
    // rows is derived from products; keying off products is sufficient.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [products])

  const isMatched = (key: string) => matchByKey[key] ?? true
  const setQty = (key: string, v: number) => {
    setQtyByKey((s) => ({ ...s, [key]: v }))
    if (isMatched(key)) setEmptiesByKey((s) => ({ ...s, [key]: v }))
  }
  const toggleMatch = (key: string) => {
    const next = !isMatched(key)
    setMatchByKey((s) => ({ ...s, [key]: next }))
    if (next) setEmptiesByKey((s) => ({ ...s, [key]: qtyByKey[key] ?? 0 }))
  }

  const billTotal = rows.reduce(
    (sum, r) => sum + (qtyByKey[r.key] ?? 0) * Number(priceByKey[r.key] || 0),
    0,
  )

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    const lines = rows
      .map((r) => ({
        product: r.product,
        qty: qtyByKey[r.key] ?? 0,
        price: Number(priceByKey[r.key] || 0),
        empties: r.product.kind === 'cylinder' ? emptiesByKey[r.key] ?? 0 : 0,
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
    const txRows = lines.map((l) => ({
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
    const { error } = await supabase.from('transactions').insert(txRows)
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
          rows={rows}
          qtyByKey={qtyByKey}
          priceByKey={priceByKey}
          emptiesByKey={emptiesByKey}
          onQty={setQty}
          onPrice={(key, v) => setPriceByKey((s) => ({ ...s, [key]: v }))}
          onEmpties={(key, v) => setEmptiesByKey((s) => ({ ...s, [key]: v }))}
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
