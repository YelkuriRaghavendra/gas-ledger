import { FormEvent, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../../auth/AuthContext'
import { useProducts } from '../../hooks/useProducts'
import { Stepper } from '../../components/Stepper'
import { ChevronLeftIcon } from '../../components/icons'
import { combineDateWithNow, todayInputValue } from '../../utils/format'
import { insertBillWithRetry } from '../../utils/billNumber'

export function DomesticLogReturn() {
  const navigate = useNavigate()
  const { session } = useAuth()
  const { data: products } = useProducts('domestic')

  const returnableProducts = products.filter((p) => p.kind === 'cylinder' || p.kind === 'accessory')

  const [qtyByProduct, setQtyByProduct] = useState<Record<number, number>>({})
  const [date, setDate] = useState(todayInputValue())
  const [note, setNote] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const setQty = (pid: number, v: number) => setQtyByProduct((s) => ({ ...s, [pid]: v }))

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    const lines = returnableProducts
      .map((p) => ({ productId: p.id, name: p.name, qty: qtyByProduct[p.id] ?? 0 }))
      .filter((l) => l.qty > 0)

    if (lines.length === 0) {
      setError('Add at least one item')
      return
    }

    setSaving(true)
    setError(null)
    const timestamp = combineDateWithNow(date)

    let bill: { id: number }
    try {
      bill = await insertBillWithRetry({
        customer_id: null,
        type: 'return',
        total_amount: 0,
        paid: false,
        note: note.trim() || null,
        created_by: session?.user.id,
        created_at: timestamp,
      })
    } catch (err: any) {
      setSaving(false)
      setError(err?.message ?? 'Failed to create return')
      return
    }

    const { error: linesErr } = await (await import('../../lib/supabase')).supabase
      .from('bill_lines')
      .insert(
        lines.map((l) => ({
          bill_id: bill.id,
          product_id: l.productId,
          qty: l.qty,
          empties: 0,
          amount: 0,
          delivered: true,
          created_by: session?.user.id,
          created_at: timestamp,
        })),
      )
    setSaving(false)
    if (linesErr) {
      setError(linesErr.message)
      return
    }
    navigate('/domestic')
  }

  const fieldLabel = 'mb-[7px] text-[11px] font-bold uppercase tracking-[0.5px] text-muted'
  const fieldInput =
    'h-[38px] rounded-[12px] border border-borderMuted bg-surface px-[12px] text-[12.5px] font-bold text-ink shadow-card'

  return (
    <div className="p-5 pb-10 pt-3">
      <Link to="/domestic" className="mb-3 inline-flex items-center gap-[6px] py-[6px] text-sm font-bold text-muted">
        <ChevronLeftIcon size={18} /> Back
      </Link>
      <h1 className="mb-[18px] font-display text-[26px] font-bold tracking-[-0.5px] text-ink">Log return</h1>

      <form onSubmit={handleSubmit}>
        <div className="rounded-[24px] bg-surface p-5 shadow-card">
          <div className="mb-4">
            <p className={fieldLabel}>Date</p>
            <input
              type="date"
              value={date}
              max={todayInputValue()}
              onChange={(e) => setDate(e.target.value)}
              className={fieldInput + ' w-full'}
            />
          </div>

          <p className="mb-3 text-[12px] font-semibold text-subtle">Enter items returned to godown.</p>

          <div className="flex flex-col gap-4">
            {returnableProducts.map((p) => (
              <div key={p.id} className="flex items-center justify-between">
                <span className="text-[13px] font-bold text-ink">{p.name}</span>
                <Stepper
                  value={qtyByProduct[p.id] ?? 0}
                  onChange={(v) => setQty(p.id, v)}
                  min={0}
                  variant="secondary"
                  size="sm"
                />
              </div>
            ))}
          </div>

          <div className="mt-4">
            <p className={fieldLabel}>Note (optional)</p>
            <input
              type="text"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="e.g. TV - customer name"
              className={fieldInput + ' w-full'}
            />
          </div>
        </div>

        {error && <p className="mt-4 text-sm font-semibold text-red-600">{error}</p>}
        <button
          type="submit"
          disabled={saving}
          className="mt-4 h-[56px] w-full rounded-[16px] bg-[#2E8B57] text-[15px] font-bold text-white shadow-[0_12px_26px_-10px_rgba(46,139,87,0.65)] transition active:scale-[0.99] disabled:opacity-50"
        >
          {saving ? 'Saving...' : 'Save return'}
        </button>
      </form>
    </div>
  )
}
