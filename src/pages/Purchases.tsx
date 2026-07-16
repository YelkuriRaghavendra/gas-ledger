import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { supabase } from '../lib/supabase'
import { useProducts } from '../hooks/useProducts'
import { usePurchases } from '../hooks/usePurchases'
import { useProfiles } from '../hooks/useProfiles'
import { formatCurrency, formatDate, formatRelativeDate, formatUpdated } from '../utils/format'
import { PlusIcon } from '../components/icons'
import { AppHeader } from '../components/AppHeader'
import { AccountMenu } from '../components/AccountMenu'
import { DetailModal } from '../components/DetailModal'
import type { Purchase } from '../types/db'

function purchaseTitle(p: Purchase, productName?: string) {
  return `${p.qty} × ${productName ?? 'cylinders'} purchased`
}

function cardSubtitle(p: Purchase) {
  const date = formatRelativeDate(p.created_at)
  return p.paid ? date : `${date} · On credit`
}

function purchaseRows(p: Purchase, productName?: string) {
  const rows = [{ k: 'Quantity', v: `${p.qty} × ${productName ?? 'cylinders'}` }]
  if (p.empties_given > 0) rows.push({ k: 'Empties given', v: String(p.empties_given) })
  rows.push({
    k: 'Payment',
    v: p.paid ? (p.method === 'upi' ? 'Paid (UPI)' : p.method === 'cash' ? 'Paid (Cash)' : 'Paid') : 'On credit',
  })
  if (p.note) rows.push({ k: 'Note', v: p.note })
  return rows
}

export function Purchases() {
  const { profile } = useAuth()
  const isOwner = profile?.role === 'owner'
  const { data: products } = useProducts()
  const { data: purchases, refresh } = usePurchases()
  const [accountOpen, setAccountOpen] = useState(false)
  const [selected, setSelected] = useState<Purchase | null>(null)
  const profileNames = useProfiles()
  const productNameById = new Map(products.map((p) => [p.id, p.name]))

  async function handleDelete(id: number) {
    if (!confirm('Delete this purchase?')) return
    const { error } = await supabase.from('purchases').delete().eq('id', id)
    if (!error) {
      setSelected(null)
      refresh()
    }
  }

  const selectedName =
    selected && selected.product_id !== null ? productNameById.get(selected.product_id) : undefined

  return (
    <div className="pb-[110px]">
      <AppHeader segment="commercial" onOpenAccount={() => setAccountOpen(true)} />
      <AccountMenu open={accountOpen} onClose={() => setAccountOpen(false)} />

      <div className="p-5 pt-1">
        <div className="mb-[22px] flex items-center justify-between">
          <h1 className="font-display text-2xl font-bold tracking-[-0.4px] text-ink">Purchases</h1>
          <Link
            to="/purchases/new"
            className="flex h-10 w-10 items-center justify-center rounded-[13px] bg-gradient-to-br from-accentSoft to-accent shadow-glow"
          >
            <PlusIcon size={20} strokeWidth={2.4} color="#fff" />
          </Link>
        </div>

        <ul className="flex flex-col gap-[9px]">
          {purchases.map((p) => {
            const productName = p.product_id !== null ? productNameById.get(p.product_id) : undefined
            return (
              <li key={p.id}>
                <button
                  type="button"
                  onClick={() => setSelected(p)}
                  className="flex w-full items-center gap-3 rounded-[16px] bg-surface px-[14px] py-[13px] text-left shadow-card transition active:scale-[0.99]"
                >
                  <div
                    className="flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-[12px] text-[16px]"
                    style={{ backgroundColor: '#FBEDE4', color: '#E4571B' }}
                  >
                    📦
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13.5px] font-bold text-ink">{purchaseTitle(p, productName)}</p>
                    <p className="mt-[2px] text-[10.5px] font-semibold text-subtle">{cardSubtitle(p)}</p>
                  </div>
                  <p className="shrink-0 font-display text-[14.5px] font-bold text-[#E4571B]">
                    {formatCurrency(p.amount)}
                  </p>
                </button>
              </li>
            )
          })}
        </ul>
        {purchases.length === 0 && (
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
          title={selectedName ?? 'Purchase'}
          subtitle={formatDate(selected.created_at)}
          amount={formatCurrency(selected.amount)}
          rows={purchaseRows(selected, selectedName)}
          created={formatDate(selected.created_at)}
          createdBy={selected.created_by ? profileNames.get(selected.created_by) : undefined}
          updated={formatUpdated(selected.updated_at, selected.created_at)}
          updatedBy={selected.updated_by ? profileNames.get(selected.updated_by) : undefined}
          actions={
            isOwner ? (
              <>
                <Link
                  to={`/purchases/${selected.id}/edit`}
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
