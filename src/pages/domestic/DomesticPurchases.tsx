import { Link } from 'react-router-dom'
import { useAuth } from '../../auth/AuthContext'
import { supabase } from '../../lib/supabase'
import { useProducts } from '../../hooks/useProducts'
import { usePurchases } from '../../hooks/usePurchases'
import { formatCurrency, formatRelativeDate } from '../../utils/format'
import { PlusIcon } from '../../components/icons'
import type { Purchase } from '../../types/db'

interface PurchaseBill {
  billId: string
  createdAt: string
  total: number
  lines: Purchase[]
}

function groupIntoBills(rows: Purchase[]): PurchaseBill[] {
  const byBill = new Map<string, Purchase[]>()
  for (const p of rows) {
    const key = p.bill_id ?? `pu-${p.id}`
    const list = byBill.get(key)
    if (list) list.push(p)
    else byBill.set(key, [p])
  }
  return Array.from(byBill.entries()).map(([billId, lines]) => ({
    billId,
    createdAt: lines[0].created_at,
    total: lines.reduce((sum, l) => sum + l.amount, 0),
    lines,
  }))
}

export function DomesticPurchases() {
  const { profile } = useAuth()
  const isOwner = profile?.role === 'owner'
  const { data: products } = useProducts('domestic')
  const { data: purchases, refresh } = usePurchases('domestic')
  const productNameById = new Map(products.map((p) => [p.id, p.name]))
  const bills = groupIntoBills(purchases)

  async function handleDeleteBill(bill: PurchaseBill) {
    if (!confirm('Delete this stock-in entry?')) return
    const ids = bill.lines.map((l) => l.id)
    const { error } = await supabase.from('purchases').delete().in('id', ids)
    if (!error) refresh()
  }

  return (
    <div className="p-5 pb-[110px] pt-3">
      <div className="mb-[22px] flex items-center justify-between">
        <h1 className="font-display text-[26px] font-bold tracking-[-0.5px] text-ink">Purchases</h1>
        <Link
          to="/domestic/purchases/new"
          className="flex h-10 w-10 items-center justify-center rounded-[13px] bg-[#2E8B57] shadow-[0_8px_18px_-8px_rgba(46,139,87,0.7)]"
        >
          <PlusIcon size={20} strokeWidth={2.4} />
        </Link>
      </div>

      <ul className="flex flex-col gap-[11px]">
        {bills.map((b) => (
          <li key={b.billId} className="rounded-[18px] bg-surface p-[15px] shadow-card">
            <div className="flex items-baseline justify-between gap-2">
              <p className="text-[12px] font-bold uppercase tracking-[0.4px] text-subtle">
                {formatRelativeDate(b.createdAt)}
              </p>
              <div className="flex items-center gap-3">
                {b.total > 0 && (
                  <p className="font-display text-[15px] font-bold text-[#2E8B57]">{formatCurrency(b.total)}</p>
                )}
                {isOwner && (
                  <button onClick={() => handleDeleteBill(b)} className="text-xs font-bold text-red-600">
                    Delete
                  </button>
                )}
              </div>
            </div>
            <ul className="mt-[10px] flex flex-col gap-[6px]">
              {b.lines.map((l) => (
                <li key={l.id} className="flex items-baseline justify-between gap-2">
                  <p className="text-[13.5px] font-bold text-ink">
                    {l.qty} × {productNameById.get(l.product_id) ?? 'item'}
                  </p>
                  <p className="text-[12px] font-semibold text-subtle">
                    {l.empties_given > 0 ? `${l.empties_given} empties given` : ''}
                  </p>
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ul>
      {bills.length === 0 && <p className="text-muted">No stock received yet.</p>}
    </div>
  )
}
