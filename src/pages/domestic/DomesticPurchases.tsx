import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../../auth/AuthContext'

import { supabase } from '../../lib/supabase'
import { useProducts } from '../../hooks/useProducts'
import { usePurchaseOrders, type PurchaseOrderWithLines } from '../../hooks/usePurchaseOrders'
import { useProfiles } from '../../hooks/useProfiles'
import { formatCurrency, formatDate, formatRelativeDate, formatUpdated } from '../../utils/format'
import { PlusIcon } from '../../components/icons'
import { AppHeader } from '../../components/AppHeader'
import { AccountMenu } from '../../components/AccountMenu'
import { DetailModal } from '../../components/DetailModal'

function billRows(order: PurchaseOrderWithLines, productNameById: Map<number, string>) {
  const rows = order.purchase_lines.map((l) => ({
    k: `${l.qty} × ${productNameById.get(l.product_id) ?? 'item'}`,
    v: l.amount > 0 ? formatCurrency(l.amount) : '—',
  }))
  const empties = order.purchase_lines.reduce((sum, l) => sum + l.empties_given, 0)
  if (empties > 0) rows.push({ k: 'Empties given', v: String(empties) })
  return rows
}

export function DomesticPurchases() {
  const [accountOpen, setAccountOpen] = useState(false)
  const [selected, setSelected] = useState<PurchaseOrderWithLines | null>(null)
  const profileNames = useProfiles()
  const { profile } = useAuth()
  const isOwner = profile?.role === 'owner'
  const { data: products } = useProducts('domestic')
  const { data: orders, refresh } = usePurchaseOrders('domestic')
  const productNameById = new Map(products.map((p) => [p.id, p.name]))

  async function handleDeleteBill(order: PurchaseOrderWithLines) {
    if (!confirm('Delete this stock-in entry?')) return
    const { error } = await supabase.from('purchase_orders').delete().eq('id', order.id)
    if (!error) {
      setSelected(null)
      refresh()
    }
  }

  return (
    <div className="pb-[110px]">
      <AppHeader view="domestic" onOpenAccount={() => setAccountOpen(true)} />
      <AccountMenu open={accountOpen} onClose={() => setAccountOpen(false)} />

      <div className="p-5 pt-1">
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
          {orders.map((o) => (
            <li key={o.id}>
              <button
                type="button"
                onClick={() => setSelected(o)}
                className="flex w-full flex-col rounded-[18px] bg-surface p-[15px] text-left shadow-card transition active:scale-[0.99]"
              >
                <div className="flex items-baseline justify-between gap-2">
                  <p className="text-[12px] font-bold uppercase tracking-[0.4px] text-subtle">
                    {formatRelativeDate(o.created_at)}
                  </p>
                  {o.total_amount > 0 && (
                    <p className="font-display text-[15px] font-bold text-[#2E8B57]">{formatCurrency(o.total_amount)}</p>
                  )}
                </div>
                <ul className="mt-[10px] flex flex-col gap-[6px]">
                  {o.purchase_lines.map((l) => (
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
              </button>
            </li>
          ))}
        </ul>
        {orders.length === 0 && (
          <p className="rounded-[18px] bg-surface px-4 py-8 text-center text-sm font-medium text-subtle shadow-card">
            No stock received yet
          </p>
        )}
      </div>

      {selected && (
        <DetailModal
          open={selected !== null}
          onClose={() => setSelected(null)}
          icon="📦"
          iconBg="#E7F3EC"
          iconColor="#2E8B57"
          title="Stock received"
          subtitle={formatDate(selected.created_at)}
          amount={selected.total_amount > 0 ? formatCurrency(selected.total_amount) : undefined}
          rows={billRows(selected, productNameById)}
          created={formatDate(selected.created_at)}
          createdBy={selected.created_by ? profileNames.get(selected.created_by) : undefined}
          updated={formatUpdated(selected.updated_at, selected.created_at)}
          updatedBy={selected.updated_by ? profileNames.get(selected.updated_by) : undefined}
          actions={
            isOwner ? (
              <>
                <Link
                  to={`/domestic/purchases/${selected.id}/edit`}
                  onClick={() => setSelected(null)}
                  className="flex h-[48px] flex-1 items-center justify-center rounded-[14px] bg-gradient-to-br from-[#3DA06A] to-[#2E8B57] font-bold text-white shadow-[0_10px_22px_-12px_rgba(46,139,87,0.7)] transition active:scale-[0.99]"
                >
                  Edit
                </Link>
                <button
                  type="button"
                  onClick={() => handleDeleteBill(selected)}
                  className="flex h-[48px] flex-1 items-center justify-center rounded-[14px] bg-[#FBEAE6] font-bold text-[#C23B22] transition active:scale-[0.99]"
                >
                  Delete
                </button>
              </>
            ) : undefined
          }
        />
      )}
    </div>
  )
}
