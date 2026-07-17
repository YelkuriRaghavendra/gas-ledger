import { useMemo, useState } from 'react'
import { useAuth } from '../../auth/AuthContext'
import { supabase } from '../../lib/supabase'
import { useProducts } from '../../hooks/useProducts'
import { useProfiles } from '../../hooks/useProfiles'
import { useDomesticSales, type DomesticBill } from '../../hooks/useDomesticSales'
import { formatCurrency, formatDate, formatRelativeDate, formatUpdated } from '../../utils/format'
import { AppHeader } from '../../components/AppHeader'
import { AccountMenu } from '../../components/AccountMenu'
import { DetailModal } from '../../components/DetailModal'
import { countNewConnections } from '../../utils/newConnection'

interface DayGroup {
  day: string
  revenue: number
  bills: DomesticBill[]
}

function daysAgoStartIso(days: number) {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  d.setDate(d.getDate() - days)
  return d.toISOString()
}

function dayKey(iso: string) {
  const d = new Date(iso)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function groupByDay(bills: DomesticBill[]): DayGroup[] {
  const byDay = new Map<string, DomesticBill[]>()
  for (const b of bills) {
    const key = dayKey(b.createdAt)
    const list = byDay.get(key)
    if (list) list.push(b)
    else byDay.set(key, [b])
  }
  return Array.from(byDay.entries()).map(([day, bills]) => ({
    day,
    revenue: bills.reduce((sum, b) => sum + b.total, 0),
    bills,
  }))
}

function billRows(bill: DomesticBill, productNameById: Map<number, string>) {
  const rows = bill.lines.map((l) => ({
    k: `${l.qty} × ${l.product_id !== null ? productNameById.get(l.product_id) ?? 'item' : 'item'}`,
    v: formatCurrency(l.amount),
  }))
  const empties = bill.lines.reduce((sum, l) => sum + l.empties, 0)
  if (empties > 0) rows.push({ k: 'Empties received', v: String(empties) })
  return rows
}

function billCreatedAt(bill: DomesticBill) {
  return bill.lines.reduce((min, l) => (l.created_at < min ? l.created_at : min), bill.lines[0].created_at)
}

function billUpdatedAt(bill: DomesticBill) {
  return bill.lines.reduce((max, l) => (l.updated_at > max ? l.updated_at : max), bill.lines[0].updated_at)
}

function billUpdatedBy(bill: DomesticBill) {
  return bill.lines.reduce((latest, l) => (l.updated_at > latest.updated_at ? l : latest), bill.lines[0]).updated_by
}

export function DomesticHistory() {
  const [accountOpen, setAccountOpen] = useState(false)
  const [selected, setSelected] = useState<DomesticBill | null>(null)
  const { profile } = useAuth()
  const isOwner = profile?.role === 'owner'
  const { data: products } = useProducts('domestic')
  const profileNames = useProfiles()
  const since = useMemo(() => daysAgoStartIso(30), [])
  const { bills, loading, error, refresh } = useDomesticSales(since)

  const productNameById = new Map(products.map((p) => [p.id, p.name]))
  const groups = groupByDay(bills)
  const ncProductIds = new Set(products.filter((p) => p.is_new_connection).map((p) => p.id))

  async function handleDelete(bill: DomesticBill) {
    if (!confirm('Delete this bill?')) return
    const ids = bill.lines.map((l) => l.id)
    const { error } = await supabase.from('transactions').delete().in('id', ids)
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
        <h1 className="mb-1 font-display text-[26px] font-bold tracking-[-0.5px] text-ink">History</h1>
        <p className="mb-5 text-[13px] font-medium text-subtle">Day-by-day sales, last 30 days</p>

        {loading && <p className="text-muted">Loading…</p>}
        {error && <p className="mb-4 text-red-600">{error}</p>}

        {!loading && (
          <div className="flex flex-col gap-5">
            {groups.map((g) => (
              <div key={g.day}>
                <div className="mb-[9px] flex items-baseline justify-between gap-2 px-1">
                  <p className="text-[11.5px] font-bold uppercase tracking-[0.4px] text-subtle">{formatRelativeDate(g.day)}</p>
                  <p className="font-display text-[13px] font-bold text-[#2E8B57]">
                    {formatCurrency(g.revenue)} · {g.bills.length} bill{g.bills.length === 1 ? '' : 's'}
                    {(() => {
                      const nc = countNewConnections(g.bills, ncProductIds)
                      return nc > 0 ? ` · ${nc} NC` : null
                    })()}
                  </p>
                </div>
                <ul className="flex flex-col gap-[9px]">
                  {g.bills.map((b) => (
                    <li key={b.billId}>
                      <button
                        type="button"
                        onClick={() => setSelected(b)}
                        className="flex w-full items-center gap-3 rounded-[16px] bg-surface px-[14px] py-[13px] text-left shadow-card transition active:scale-[0.99]"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-[13.5px] font-bold text-ink">
                            {b.lines
                              .map((l) => `${l.qty} × ${l.product_id !== null ? productNameById.get(l.product_id) ?? 'item' : 'item'}`)
                              .join(', ')}
                          </p>
                          <p className="mt-[2px] text-[10.5px] font-semibold text-subtle">
                            {new Date(b.createdAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                          </p>
                        </div>
                        <p className="shrink-0 font-display text-[14.5px] font-bold text-[#2E8B57]">{formatCurrency(b.total)}</p>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}

        {!loading && groups.length === 0 && (
          <p className="rounded-[18px] bg-surface px-4 py-8 text-center text-sm font-medium text-subtle shadow-card">
            No sales in the last 30 days
          </p>
        )}
      </div>

      {selected && (
        <DetailModal
          open={selected !== null}
          onClose={() => setSelected(null)}
          icon="🧾"
          iconBg="#E7F3EC"
          iconColor="#2E8B57"
          title="Counter bill"
          subtitle={formatDate(selected.createdAt)}
          amount={formatCurrency(selected.total)}
          rows={billRows(selected, productNameById)}
          created={formatDate(billCreatedAt(selected))}
          createdBy={selected.lines[0].created_by ? profileNames.get(selected.lines[0].created_by) : undefined}
          updated={formatUpdated(billUpdatedAt(selected), billCreatedAt(selected))}
          updatedBy={billUpdatedBy(selected) ? profileNames.get(billUpdatedBy(selected)!) : undefined}
          actions={
            isOwner ? (
              <button
                type="button"
                onClick={() => handleDelete(selected)}
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
