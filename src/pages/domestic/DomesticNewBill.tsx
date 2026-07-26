import { FormEvent, useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '../../auth/AuthContext'
import { supabase } from '../../lib/supabase'
import { useProducts } from '../../hooks/useProducts'
import { useBundleComponents } from '../../hooks/useBundleComponents'
import { NewBillTable, type BillRow } from '../../components/NewBillTable'
import { combineDateWithNow, todayInputValue } from '../../utils/format'
import { ChevronLeftIcon } from '../../components/icons'
import type { PaymentMethod, BillLine } from '../../types/db'
import { nextBillNumber } from '../../utils/billNumber'

export function DomesticNewBill() {
  const navigate = useNavigate()
  const { billId } = useParams<{ billId?: string }>()
  const editing = Boolean(billId)
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
  const [method, setMethod] = useState<PaymentMethod>('cash')
  const [date, setDate] = useState(todayInputValue())
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [editLoaded, setEditLoaded] = useState(false)

  useEffect(() => {
    if (!billId || products.length === 0 || editLoaded) return
    supabase
      .from('bills')
      .select('*, bill_lines(*)')
      .eq('id', Number(billId))
      .single()
      .then(({ data }) => {
        if (!data) return
        const bill = data as any
        const lines = (bill.bill_lines ?? []) as BillLine[]
        setMethod(bill.method ?? 'cash')
        setNote(bill.note ?? '')
        const d = new Date(bill.created_at)
        setDate(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`)

        const newQty: Record<string, number> = {}
        const newEmpties: Record<string, number> = {}
        const newPrice: Record<string, string> = {}
        const newMatch: Record<string, boolean> = {}

        for (const line of lines) {
          if (!line.product_id) continue
          const product = products.find((p) => p.id === line.product_id)
          if (!product) continue
          const perUnit = line.qty > 0 ? Math.round(line.amount / line.qty) : 0
          const opts = product.price_options ?? []
          let key: string
          if (opts.length === 0) {
            key = String(product.id)
          } else {
            const optIdx = opts.findIndex((o) => o.amount === perUnit)
            key = optIdx >= 0 ? `${product.id}#${optIdx}` : `${product.id}#d`
          }
          newQty[key] = (newQty[key] ?? 0) + line.qty
          newEmpties[key] = (newEmpties[key] ?? 0) + line.empties
          newPrice[key] = String(perUnit || product.price)
          if (product.kind === 'cylinder') {
            newMatch[key] = newEmpties[key] === newQty[key]
          }
        }
        setQtyByKey(newQty)
        setEmptiesByKey(newEmpties)
        setPriceByKey((prev) => ({ ...prev, ...newPrice }))
        setMatchByKey(newMatch)
        setEditLoaded(true)
      })
  }, [billId, products, editLoaded])

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
    const timestamp = combineDateWithNow(date)
    const totalAmount = lines.reduce((sum, l) => sum + l.qty * l.price, 0)

    if (editing) {
      // Update the bill header
      const { error: updErr } = await supabase
        .from('bills')
        .update({
          total_amount: totalAmount,
          paid: true,
          method,
          note: note.trim() || null,
          created_at: timestamp,
        })
        .eq('id', Number(billId))
      if (updErr) {
        setError(updErr.message)
        setSaving(false)
        return
      }
      // Delete old bill_lines (will reinsert below)
      const { error: delErr } = await supabase
        .from('bill_lines')
        .delete()
        .eq('bill_id', Number(billId))
      if (delErr) {
        setError(delErr.message)
        setSaving(false)
        return
      }
      // Insert new bill_lines
      const lineRows = lines.map((l) => ({
        bill_id: Number(billId),
        product_id: l.product.id,
        qty: l.qty,
        empties: l.empties,
        amount: l.qty * l.price,
        delivered: l.product.pending_delivery ? false : l.product.kind !== 'service',
        created_by: session?.user.id,
        created_at: timestamp,
      }))
      const { error: insErr } = await supabase.from('bill_lines').insert(lineRows)
      setSaving(false)
      if (insErr) {
        setError(insErr.message)
        return
      }
    } else {
      // Generate bill number
      const billNumber = await nextBillNumber()
      // Insert bill header
      const { data: newBill, error: billErr } = await supabase
        .from('bills')
        .insert({
          bill_number: billNumber,
          customer_id: null,
          type: 'sale' as const,
          total_amount: totalAmount,
          paid: true,
          method,
          note: note.trim() || null,
          created_by: session?.user.id,
          created_at: timestamp,
        })
        .select('id')
        .single()
      if (billErr || !newBill) {
        setError(billErr?.message ?? 'Failed to create bill')
        setSaving(false)
        return
      }
      // Insert bill_lines
      const lineRows = lines.map((l) => ({
        bill_id: newBill.id,
        product_id: l.product.id,
        qty: l.qty,
        empties: l.empties,
        amount: l.qty * l.price,
        delivered: l.product.pending_delivery ? false : l.product.kind !== 'service',
        created_by: session?.user.id,
        created_at: timestamp,
      }))
      const { error: linesErr } = await supabase.from('bill_lines').insert(lineRows)
      setSaving(false)
      if (linesErr) {
        setError(linesErr.message)
        return
      }
    }
    navigate(editing ? '/domestic/history' : '/domestic')
  }

  const fieldInput =
    'h-[38px] rounded-[12px] border border-borderMuted bg-surface px-[12px] text-[12.5px] font-bold text-ink shadow-card'

  const segBtn = (active: boolean) =>
    `flex-1 rounded-[12px] py-[11px] text-[13.5px] font-bold transition ${
      active
        ? 'bg-gradient-to-br from-[#3DA06A] to-[#2E8B57] text-white shadow-[0_10px_22px_-12px_rgba(46,139,87,0.7)]'
        : 'text-muted'
    }`

  return (
    <div className="p-5 pb-10 pt-3">
      <div className="mb-[14px] flex items-center justify-between">
        <Link
          to={editing ? '/domestic/history' : '/domestic'}
          aria-label="Back"
          className="flex h-9 w-9 items-center justify-center rounded-[12px] bg-surface text-muted shadow-card"
        >
          <ChevronLeftIcon size={18} />
        </Link>
        <h1 className="font-display text-[20px] font-bold tracking-[-0.5px] text-ink">{editing ? 'Edit bill' : 'New bill'}</h1>
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

        <div className="mt-4">
          <p className="mb-[7px] text-[11px] font-bold uppercase tracking-[0.5px] text-muted">
            Payment mode
          </p>
          <div className="flex gap-2 rounded-[14px] bg-cream p-[5px]">
            <button type="button" onClick={() => setMethod('cash')} className={segBtn(method === 'cash')}>
              Cash
            </button>
            <button type="button" onClick={() => setMethod('upi')} className={segBtn(method === 'upi')}>
              UPI
            </button>
            <button type="button" onClick={() => setMethod('vitran')} className={segBtn(method === 'vitran')}>
              Vitran
            </button>
          </div>
        </div>

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
          {saving ? 'Saving…' : editing ? 'Update bill' : 'Save bill'}
        </button>
      </form>
    </div>
  )
}
