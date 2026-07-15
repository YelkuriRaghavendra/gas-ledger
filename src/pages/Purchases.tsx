import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { supabase } from '../lib/supabase'
import { useProducts } from '../hooks/useProducts'
import { usePurchases } from '../hooks/usePurchases'
import { formatCurrency, formatRelativeDate } from '../utils/format'
import { PlusIcon } from '../components/icons'
import { AppHeader } from '../components/AppHeader'
import { AccountMenu } from '../components/AccountMenu'
import type { Purchase } from '../types/db'

function purchaseTitle(p: Purchase, productName?: string) {
  return `${p.qty} × ${productName ?? 'cylinders'} purchased`
}

function purchaseSubtitle(p: Purchase) {
  const date = formatRelativeDate(p.created_at)
  const empties = p.empties_given ? ` · ${p.empties_given} empties given` : ''
  const paid = p.paid ? ` · Paid${p.method ? ` (${p.method === 'upi' ? 'UPI' : 'Cash'})` : ''}` : ' · On credit'
  return `${date} · ${formatCurrency(p.amount)}${empties}${paid}`
}

export function Purchases() {
  const { profile } = useAuth()
  const isOwner = profile?.role === 'owner'
  const { data: products } = useProducts()
  const { data: purchases, refresh } = usePurchases()
  const [accountOpen, setAccountOpen] = useState(false)
  const productNameById = new Map(products.map((p) => [p.id, p.name]))

  async function handleDelete(id: number) {
    if (!confirm('Delete this purchase?')) return
    const { error } = await supabase.from('purchases').delete().eq('id', id)
    if (!error) refresh()
  }

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

        <ul className="flex flex-col gap-0">
          {purchases.map((p) => {
            const productName = p.product_id !== null ? productNameById.get(p.product_id) : undefined
            return (
              <li key={p.id} className="flex gap-[14px] pb-[18px]">
                <div
                  className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-[11px] text-[15px]"
                  style={{ backgroundColor: '#FBEDE4', color: '#E4571B' }}
                >
                  📦
                </div>
                <div className="flex-1 pt-px">
                  <div className="flex items-baseline justify-between gap-2">
                    <p className="text-sm font-bold text-ink">{purchaseTitle(p, productName)}</p>
                    <p className="font-display text-sm font-bold text-[#E4571B]">{formatCurrency(p.amount)}</p>
                  </div>
                  <p className="mt-[2px] text-xs font-semibold text-[#9A8F80]">{purchaseSubtitle(p)}</p>
                  {p.note && <p className="mt-[1px] text-xs italic text-muted">{p.note}</p>}
                </div>
                {isOwner && (
                  <div className="flex shrink-0 flex-col items-end gap-1 self-start">
                    <Link to={`/purchases/${p.id}/edit`} className="text-xs font-bold text-accent">
                      Edit
                    </Link>
                    <button onClick={() => handleDelete(p.id)} className="text-xs font-bold text-red-600">
                      Delete
                    </button>
                  </div>
                )}
              </li>
            )
          })}
        </ul>
        {purchases.length === 0 && <p className="text-muted">No purchases yet.</p>}
      </div>
    </div>
  )
}
