import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../../auth/AuthContext'
import { supabase } from '../../lib/supabase'
import { useProducts } from '../../hooks/useProducts'
import { usePurchases } from '../../hooks/usePurchases'
import { useProfiles } from '../../hooks/useProfiles'
import { formatCurrency, formatDate, formatRelativeDate, formatUpdated } from '../../utils/format'
import { PlusIcon } from '../../components/icons'
import { AppHeader } from '../../components/AppHeader'
import { AccountMenu } from '../../components/AccountMenu'
import { DetailModal } from '../../components/DetailModal'
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

function billRows(bill: PurchaseBill, productNameById: Map<number, string>) {
  const rows = bill.lines.map((l) => ({
    k: `${l.qty} × ${productNameById.get(l.product_id) ?? 'item'}`,
    v: l.amount > 0 ? formatCurrency(l.amount) : '—',
  }))
  const empties = bill.lines.reduce((sum, l) => sum + l.empties_given, 0)
  if (empties > 0) rows.push({ k: 'Empties given', v: String(empties) })
  return rows
}

function billCreatedAt(bill: PurchaseBill) {
  return bill.lines.reduce((min, l) => (l.created_at < min ? l.created_at : min), bill.lines[0].created_at)
}

function billUpdatedAt(bill: PurchaseBill) {
  return bill.lines.reduce((max, l) => (l.updated_at > max ? l.updated_at : max), bill.lines[0].updated_at)
}

function billUpdatedBy(bill: PurchaseBill) {
  return bill.lines.reduce((latest, l) => (l.updated_at > latest.updated_at ? l : latest), bill.lines[0]).updated_by
}

export function DomesticPurchases() {
  const [accountOpen, setAccountOpen] = useState(false)
  const [selected, setSelected] = useState<PurchaseBill | null>(null)
  const profileNames = useProfiles()
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
    if (!error) {
      setSelected(null)
      refresh()
    }
  }

  return (
    <div className="pb-[110px]">
      <AppHeader segment="domestic" onOpenAccount={() => setAccountOpen(true)} />
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
          {bills.map((b) => (
            <li key={b.billId}>
              <button
                type="button"
                onClick={() => setSelected(b)}
                className="flex w-full flex-col rounded-[18px] bg-surface p-[15px] text-left shadow-card transition active:scale-[0.99]"
              >
                <div className="flex items-baseline justify-between gap-2">
                  <p className="text-[12px] font-bold uppercase tracking-[0.4px] text-subtle">
                    {formatRelativeDate(b.createdAt)}
                  </p>
                  {b.total > 0 && (
                    <p className="font-display text-[15px] font-bold text-[#2E8B57]">{formatCurrency(b.total)}</p>
                  )}
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
              </button>
            </li>
          ))}
        </ul>
        {bills.length === 0 && (
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
          subtitle={formatDate(selected.createdAt)}
          amount={selected.total > 0 ? formatCurrency(selected.total) : undefined}
          rows={billRows(selected, productNameById)}
          created={formatDate(billCreatedAt(selected))}
          createdBy={selected.lines[0].created_by ? profileNames.get(selected.lines[0].created_by) : undefined}
          updated={formatUpdated(billUpdatedAt(selected), billCreatedAt(selected))}
          updatedBy={billUpdatedBy(selected) ? profileNames.get(billUpdatedBy(selected)!) : undefined}
          actions={
            isOwner ? (
              <button
                type="button"
                onClick={() => handleDeleteBill(selected)}
                className="flex h-[48px] w-full items-center justify-center rounded-[14px] bg-[#FBEAE6] font-bold text-[#C23B22] transition active:scale-[0.99]"
              >
                Delete
              </button>
            ) : undefined
          }
        />
      )}
    </div>
  )
}
