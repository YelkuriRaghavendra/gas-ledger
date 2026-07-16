import { useMemo } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../../auth/AuthContext'
import { useProducts } from '../../hooks/useProducts'
import { useGodownStock } from '../../hooks/useGodownStock'
import { useDomesticSales } from '../../hooks/useDomesticSales'
import { formatCurrency } from '../../utils/format'
import { InitialsBadge } from '../../components/InitialsBadge'
import { PlusIcon, TruckIcon, SwapIcon } from '../../components/icons'

function todayStartIso() {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d.toISOString()
}

export function DomesticHome() {
  const navigate = useNavigate()
  const { profile, signOut } = useAuth()
  const canSwitch = profile?.segment_access === 'both'
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
  const accessories = stock.filter((s) => s.kind === 'accessory')

  const today = new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' })

  return (
    <div className="p-5 pb-[110px] pt-3">
      <div className="mb-6 flex items-start justify-between">
        <div>
          <p className="text-[13px] font-semibold uppercase tracking-[0.6px] text-subtle">{today}</p>
          <div className="mt-[3px] flex items-center gap-2">
            <p className="font-display text-[26px] font-bold tracking-[-0.5px] text-ink">
              Hello, {profile?.name ?? '…'}
            </p>
            <span className="rounded-full bg-[#E3F1E9] px-[10px] py-[3px] text-[11px] font-bold text-[#2E8B57]">
              Domestic
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {canSwitch && (
            <button
              onClick={() => navigate('/choose')}
              aria-label="Switch mode"
              className="flex h-[46px] w-[46px] items-center justify-center rounded-[16px] bg-surface shadow-card"
            >
              <SwapIcon size={20} color="#2E8B57" strokeWidth={2.2} />
            </button>
          )}
          <button
            onClick={() => {
              if (confirm('Sign out?')) signOut()
            }}
            aria-label="Sign out"
          >
            <InitialsBadge name={profile?.name ?? '?'} size={46} radius={16} />
          </button>
        </div>
      </div>

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

          <div className="mb-3 mt-6 grid grid-cols-2 gap-3">
            <Link
              to="/domestic/bill"
              className="flex flex-col items-center gap-2 rounded-[18px] bg-gradient-to-br from-[#3DA06A] to-[#2E8B57] py-[15px] text-white shadow-[0_14px_30px_-10px_rgba(46,139,87,0.55)] transition active:scale-[0.97]"
            >
              <PlusIcon size={22} color="#fff" strokeWidth={2.4} />
              <span className="text-[13px] font-bold">New bill</span>
            </Link>
            <Link
              to="/domestic/purchases/new"
              className="flex flex-col items-center gap-2 rounded-[18px] bg-surface py-[15px] text-ink shadow-card transition active:scale-[0.97]"
            >
              <TruckIcon size={22} color="#2E8B57" strokeWidth={2.2} />
              <span className="text-[13px] font-bold">Stock in</span>
            </Link>
          </div>

          <div className="mb-3 mt-6 flex items-baseline justify-between">
            <h2 className="font-display text-[18px] font-bold tracking-[-0.3px] text-ink">Cylinders</h2>
            <Link to="/domestic/stock" className="text-[13px] font-bold text-[#2E8B57]">
              All stock ›
            </Link>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {cylinders.map((s) => (
              <div key={s.product_id} className="rounded-[18px] bg-surface p-4 shadow-card">
                <span className="inline-block rounded-lg bg-ink px-[9px] py-[3px] font-display text-[12px] font-bold text-white">
                  {s.product_name}
                </span>
                <div className="mt-[14px] flex gap-2">
                  <div className="flex-1">
                    <p className={`font-display text-[28px] font-bold leading-none ${s.full_cylinders < 0 ? 'text-red-600' : 'text-ink'}`}>
                      {s.full_cylinders}
                    </p>
                    <p className="mt-[4px] text-[10.5px] font-semibold text-subtle">full</p>
                  </div>
                  <div className="flex-1">
                    <p className={`font-display text-[28px] font-bold leading-none ${s.empty_cylinders < 0 ? 'text-red-600' : 'text-[#2E8B57]'}`}>
                      {s.empty_cylinders}
                    </p>
                    <p className="mt-[4px] text-[10.5px] font-semibold text-subtle">empty</p>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {accessories.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
              {accessories.map((s) => (
                <span key={s.product_id} className="rounded-full bg-surface px-[13px] py-[7px] text-xs font-bold text-ink shadow-card">
                  {s.product_name} · <span className={s.full_cylinders < 0 ? 'text-red-600' : 'text-[#2E8B57]'}>{s.full_cylinders}</span>
                </span>
              ))}
            </div>
          )}

          <div className="mb-3 mt-6 flex items-baseline justify-between">
            <h2 className="font-display text-[18px] font-bold tracking-[-0.3px] text-ink">Today's bills</h2>
            <Link to="/domestic/history" className="text-[13px] font-bold text-[#2E8B57]">
              History
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
                  {b.method ? ` · ${b.method === 'upi' ? 'UPI' : 'Cash'}` : ''}
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
  )
}
