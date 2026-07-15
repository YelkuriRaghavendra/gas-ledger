import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useProducts } from '../../hooks/useProducts'
import { useGodownStock } from '../../hooks/useGodownStock'
import { useDomesticSales } from '../../hooks/useDomesticSales'
import { formatCurrency } from '../../utils/format'
import { AppHeader } from '../../components/AppHeader'
import { AccountMenu } from '../../components/AccountMenu'
import { CylindersCard, type CardItem } from '../../components/CylindersCard'

function todayStartIso() {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d.toISOString()
}

export function DomesticHome() {
  const [accountOpen, setAccountOpen] = useState(false)
  const { data: products } = useProducts('domestic')
  const { data: stock, loading, error } = useGodownStock('domestic')
  const since = useMemo(todayStartIso, [])
  const { bills } = useDomesticSales(since)

  const productNameById = new Map(products.map((p) => [p.id, p.name]))
  const revenueToday = bills.reduce((sum, b) => sum + b.total, 0)
  const cylinderIds = new Set(products.filter((p) => p.kind === 'cylinder').map((p) => p.id))
  const cylindersSoldToday = bills.reduce(
    (sum, b) => sum + b.lines.reduce((s, l) => s + (l.product_id !== null && cylinderIds.has(l.product_id) ? l.qty : 0), 0),
    0,
  )

  const cylinders = stock.filter((s) => s.kind === 'cylinder')

  const cylinderItems: CardItem[] = cylinders.map((s) => ({
    name: s.product_name,
    full: s.full_cylinders,
    empty: s.empty_cylinders,
  }))

  return (
    <div className="pb-[110px]">
      <AppHeader segment="domestic" onOpenAccount={() => setAccountOpen(true)} />
      <AccountMenu open={accountOpen} onClose={() => setAccountOpen(false)} />

      <div className="px-4">
        {loading && <p className="text-muted">Loading…</p>}
        {error && <p className="text-red-600">{error}</p>}

        {!loading && !error && (
          <>
            <div className="relative overflow-hidden rounded-[26px] bg-gradient-to-br from-[#255C42] to-[#183F2D] p-6 text-white shadow-float">
              <svg
                width="170"
                height="170"
                viewBox="0 0 24 24"
                fill="rgba(61,160,106,.18)"
                className="pointer-events-none absolute -bottom-12 -right-8"
              >
                <rect x="6" y="6" width="12" height="16.5" rx="5" />
                <rect x="8.6" y="3.6" width="6.8" height="2.6" rx="1.3" />
              </svg>
              <p className="relative text-[12.5px] font-bold uppercase tracking-[0.7px] text-[#9DC7AF]">Sales today</p>
              <p className="relative mt-[6px] font-display text-[44px] font-bold leading-none tracking-[-1px] text-white">
                {formatCurrency(revenueToday)}
              </p>
              <p className="relative mt-[9px] text-[12.5px] font-semibold text-[#9DC7AF]">
                {bills.length} bill{bills.length === 1 ? '' : 's'} · {cylindersSoldToday} cylinder
                {cylindersSoldToday === 1 ? '' : 's'} sold
              </p>
            </div>

            <CylindersCard accent="green" linkLabel="All stock" linkTo="/domestic/stock" items={cylinderItems} />

            <div className="mb-3 mt-[18px] flex items-baseline justify-between">
              <h2 className="font-display text-[18px] font-bold tracking-[-0.3px] text-ink">Today's bills</h2>
              <Link to="/domestic/history" className="text-[13px] font-bold text-[#2E8B57]">
                History ›
              </Link>
            </div>
            <ul className="flex flex-col gap-[10px]">
              {bills.map((b) => (
                <li key={b.billId} className="rounded-[18px] bg-surface px-[15px] py-[13px] shadow-card">
                  <div className="flex items-baseline justify-between gap-2">
                    <p className="truncate text-[14px] font-bold text-ink">
                      {b.lines
                        .map((l) => `${l.qty} × ${l.product_id !== null ? productNameById.get(l.product_id) ?? 'item' : 'item'}`)
                        .join(', ')}
                    </p>
                    <p className="shrink-0 font-display text-[15px] font-bold text-[#2E8B57]">{formatCurrency(b.total)}</p>
                  </div>
                  <p className="mt-[3px] text-[11.5px] font-semibold text-subtle">
                    {new Date(b.createdAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                  </p>
                </li>
              ))}
              {bills.length === 0 && (
                <li className="rounded-[18px] bg-surface px-[15px] py-8 text-center text-sm font-medium text-subtle shadow-card">
                  No sales yet today
                </li>
              )}
            </ul>
          </>
        )}
      </div>
    </div>
  )
}
