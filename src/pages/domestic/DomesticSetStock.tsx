import { FormEvent, useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../../auth/AuthContext'
import { supabase } from '../../lib/supabase'
import { useProducts } from '../../hooks/useProducts'
import { useGodownStock } from '../../hooks/useGodownStock'
import { Stepper } from '../../components/Stepper'
import { ChevronLeftIcon } from '../../components/icons'
import { nextPoNumber } from '../../utils/billNumber'

export function DomesticSetStock() {
  const navigate = useNavigate()
  const { session } = useAuth()
  const { data: products } = useProducts('domestic')
  const { data: stock, loading } = useGodownStock('domestic')

  const [fullByProduct, setFullByProduct] = useState<Record<number, number>>({})
  const [emptyByProduct, setEmptyByProduct] = useState<Record<number, number>>({})
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (stock.length === 0) return
    setFullByProduct((prev) => {
      const next = { ...prev }
      let changed = false
      for (const s of stock) {
        if (next[s.product_id] === undefined) {
          next[s.product_id] = Math.max(0, s.full_cylinders)
          changed = true
        }
      }
      return changed ? next : prev
    })
    setEmptyByProduct((prev) => {
      const next = { ...prev }
      let changed = false
      for (const s of stock) {
        if (next[s.product_id] === undefined) {
          next[s.product_id] = Math.max(0, s.empty_cylinders)
          changed = true
        }
      }
      return changed ? next : prev
    })
  }, [stock])

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError(null)

    try {
      const timestamp = new Date().toISOString()
      const poNumber = await nextPoNumber()

      const lineRows: Array<{
        product_id: number
        qty: number
        empties_given: number
        amount: number
      }> = []

      for (const p of products) {
        const desiredFull = fullByProduct[p.id] ?? 0
        const desiredEmpty = emptyByProduct[p.id] ?? 0

        const { data: saleLinesData } = await supabase
          .from('bill_lines')
          .select('qty, empties, bills!inner(type)')
          .eq('product_id', p.id)
          .eq('bills.type', 'sale')
        const totalSalesQty = (saleLinesData ?? []).reduce((sum: number, r: any) => sum + r.qty, 0)
        const totalSaleEmpties = (saleLinesData ?? []).reduce((sum: number, r: any) => sum + r.empties, 0)

        const { data: returnLinesData } = await supabase
          .from('bill_lines')
          .select('qty, bills!inner(type)')
          .eq('product_id', p.id)
          .eq('bills.type', 'return')
        const totalReturns = (returnLinesData ?? []).reduce((sum: number, r: any) => sum + r.qty, 0)

        const { data: purchaseLinesData } = await supabase
          .from('purchase_lines')
          .select('qty, empties_given')
          .eq('product_id', p.id)
        const allPurchaseQty = (purchaseLinesData ?? []).reduce((sum: number, r: any) => sum + r.qty, 0)
        const allEmptiesGiven = (purchaseLinesData ?? []).reduce((sum: number, r: any) => sum + r.empties_given, 0)

        const deltaQty = desiredFull + totalSalesQty - allPurchaseQty
        const deltaEmptiesGiven = (totalSaleEmpties + totalReturns) - allEmptiesGiven - desiredEmpty

        if (deltaQty === 0 && deltaEmptiesGiven === 0) continue

        lineRows.push({
          product_id: p.id,
          qty: deltaQty,
          empties_given: deltaEmptiesGiven,
          amount: 0,
        })
      }

      if (lineRows.length === 0) {
        navigate('/domestic/stock')
        return
      }

      const { data: order, error: orderErr } = await supabase
        .from('purchase_orders')
        .insert({
          po_number: poNumber,
          type: 'opening',
          total_amount: 0,
          paid: true,
          note: 'Opening stock adjustment',
          created_by: session?.user.id,
          created_at: timestamp,
        })
        .select('id')
        .single()

      if (orderErr || !order) {
        setError(orderErr?.message ?? 'Failed to create purchase order')
        setSaving(false)
        return
      }

      const { error: insertError } = await supabase.from('purchase_lines').insert(
        lineRows.map((l) => ({
          purchase_order_id: order.id,
          product_id: l.product_id,
          qty: l.qty,
          empties_given: l.empties_given,
          amount: 0,
          created_by: session?.user.id,
          created_at: timestamp,
        })),
      )
      if (insertError) {
        setError(insertError.message)
        setSaving(false)
        return
      }

      navigate('/domestic/stock')
    } catch (err: any) {
      setError(err.message ?? 'Something went wrong')
      setSaving(false)
    }
  }

  if (loading) return <p className="p-4 text-muted">Loading…</p>

  return (
    <div className="p-5 pb-[110px] pt-3">
      <Link to="/domestic/stock" className="mb-3 inline-flex items-center gap-[6px] py-[6px] text-sm font-bold text-muted">
        <ChevronLeftIcon size={18} /> Back
      </Link>
      <h1 className="mb-2 font-display text-[26px] font-bold tracking-[-0.5px] text-ink">Set current stock</h1>
      <p className="mb-5 text-[13px] font-medium leading-[1.5] text-subtle">
        Count the cylinders physically in your godown right now and enter the numbers below. The app will adjust automatically.
      </p>

      <form onSubmit={handleSubmit}>
        <div className="space-y-3">
          {products.map((p) => (
            <div key={p.id} className="rounded-[18px] bg-surface p-[18px] shadow-card">
              <span className="inline-block rounded-lg bg-ink px-[10px] py-[4px] font-display text-[13px] font-bold text-white">
                {p.name}
              </span>
              <div className="mt-4 space-y-3">
                <div>
                  <p className="mb-[7px] text-[11px] font-bold uppercase tracking-[0.5px] text-muted">Full cylinders</p>
                  <Stepper
                    value={fullByProduct[p.id] ?? 0}
                    onChange={(v) => setFullByProduct((s) => ({ ...s, [p.id]: v }))}
                    min={0}
                    tone="surface"
                    size="sm"
                  />
                </div>
                {p.kind === 'cylinder' && (
                  <div>
                    <p className="mb-[7px] text-[11px] font-bold uppercase tracking-[0.5px] text-muted">Empty cylinders</p>
                    <Stepper
                      value={emptyByProduct[p.id] ?? 0}
                      onChange={(v) => setEmptyByProduct((s) => ({ ...s, [p.id]: v }))}
                      min={0}
                      tone="surface"
                      size="sm"
                    />
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>

        {error && <p className="mt-4 text-sm font-semibold text-red-600">{error}</p>}

        <button
          type="submit"
          disabled={saving}
          className="mt-5 h-[56px] w-full rounded-[16px] bg-gradient-to-br from-[#3DA06A] to-[#2E8B57] text-[15px] font-bold text-white shadow-[0_12px_26px_-10px_rgba(46,139,87,0.65)] transition active:scale-[0.99] disabled:opacity-50"
        >
          {saving ? 'Saving…' : 'Save stock'}
        </button>
      </form>
    </div>
  )
}
