import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { supabase } from '../lib/supabase'
import { useProducts } from '../hooks/useProducts'
import { usePurchaseOrders, type PurchaseOrderWithLines } from '../hooks/usePurchaseOrders'
import { useProfiles } from '../hooks/useProfiles'
import { formatCurrency, formatDate, formatRelativeDate, formatUpdated } from '../utils/format'
import { PlusIcon } from '../components/icons'
import { AppHeader } from '../components/AppHeader'
import { AccountMenu } from '../components/AccountMenu'
import { DetailModal } from '../components/DetailModal'

function purchaseTitle(po: PurchaseOrderWithLines, productNameById: Map<number, string>) {
  const lines = po.purchase_lines
  if (lines.length === 1) {
    const name = productNameById.get(lines[0].product_id) ?? 'cylinders'
    return `${lines[0].qty} × ${name} purchased`
  }
  const totalQty = lines.reduce((sum, l) => sum + l.qty, 0)
  return `${totalQty} cylinders purchased`
}

function cardSubtitle(po: PurchaseOrderWithLines) {
  const date = formatRelativeDate(po.created_at)
  return po.paid ? date : `${date} · On credit`
}

function purchaseRows(po: PurchaseOrderWithLines, productNameById: Map<number, string>) {
  const rows: { k: string; v: string }[] = []
  for (const line of po.purchase_lines) {
    const name = productNameById.get(line.product_id) ?? 'cylinders'
    rows.push({ k: 'Product', v: `${line.qty} × ${name}` })
    if (line.empties_given > 0) rows.push({ k: 'Empties given', v: String(line.empties_given) })
  }
  rows.push({ k: 'Payment', v: po.paid ? 'Paid' : 'On credit' })
  if (po.note) rows.push({ k: 'Note', v: po.note })
  return rows
}

export function Purchases() {
  const { profile } = useAuth()
  const isOwner = profile?.role === 'owner'
  const { data: products } = useProducts()
  const { data: purchaseOrders, refresh } = usePurchaseOrders()
  const [accountOpen, setAccountOpen] = useState(false)
  const [selected, setSelected] = useState<PurchaseOrderWithLines | null>(null)
  const profileNames = useProfiles()
  const productNameById = new Map(products.map((p) => [p.id, p.name]))

  async function handleDelete(id: number) {
    if (!confirm('Delete this purchase?')) return
    const { error } = await supabase.from('purchase_orders').delete().eq('id', id)
    if (!error) {
      setSelected(null)
      refresh()
    }
  }

  return (
    <div className="pb-[110px]">
      <AppHeader view="commercial" onOpenAccount={() => setAccountOpen(true)} />
      <AccountMenu open={accountOpen} onClose={() => setAccountOpen(false)} />

      <div className="p-5 pt-1">
        <div className="mb-[22px] flex items-center justify-between">
          <h1 className="font-display text-2xl font-bold tracking-[-0.4px] text-ink">Purchases</h1>
          <Link
            to="/commercial/purchases/new"
            className="flex h-10 w-10 items-center justify-center rounded-[13px] bg-gradient-to-br from-accentSoft to-accent shadow-glow"
          >
            <PlusIcon size={20} strokeWidth={2.4} color="#fff" />
          </Link>
        </div>

        <ul className="flex flex-col gap-[9px]">
          {purchaseOrders.map((po) => {
            return (
              <li key={po.id}>
                <button
                  type="button"
                  onClick={() => setSelected(po)}
                  className="flex w-full items-center gap-3 rounded-[16px] bg-surface px-[14px] py-[13px] text-left shadow-card transition active:scale-[0.99]"
                >
                  <div
                    className="flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-[12px] text-[16px]"
                    style={{ backgroundColor: '#FBEDE4', color: '#E4571B' }}
                  >
                    📦
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13.5px] font-bold text-ink">{purchaseTitle(po, productNameById)}</p>
                    <p className="mt-[2px] text-[10.5px] font-semibold text-subtle">{cardSubtitle(po)}</p>
                  </div>
                  <p className="shrink-0 font-display text-[14.5px] font-bold text-[#E4571B]">
                    {formatCurrency(po.total_amount)}
                  </p>
                </button>
              </li>
            )
          })}
        </ul>
        {purchaseOrders.length === 0 && (
          <p className="rounded-[18px] bg-surface px-4 py-8 text-center text-sm font-medium text-subtle shadow-card">
            No purchases yet
          </p>
        )}
      </div>

      {selected && (
        <DetailModal
          open={selected !== null}
          onClose={() => setSelected(null)}
          icon="📦"
          iconBg="#FBEDE4"
          iconColor="#E4571B"
          title={purchaseTitle(selected, productNameById)}
          subtitle={formatDate(selected.created_at)}
          amount={formatCurrency(selected.total_amount)}
          rows={purchaseRows(selected, productNameById)}
          created={formatDate(selected.created_at)}
          createdBy={selected.created_by ? profileNames.get(selected.created_by) : undefined}
          updated={formatUpdated(selected.updated_at, selected.created_at)}
          updatedBy={selected.updated_by ? profileNames.get(selected.updated_by) : undefined}
          actions={
            isOwner ? (
              <>
                <Link
                  to={`/commercial/purchases/${selected.id}/edit`}
                  onClick={() => setSelected(null)}
                  className="flex h-[48px] flex-1 items-center justify-center rounded-[14px] bg-gradient-to-br from-accentSoft to-accent font-bold text-white shadow-glow transition active:scale-[0.99]"
                >
                  Edit
                </Link>
                <button
                  type="button"
                  onClick={() => handleDelete(selected.id)}
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
