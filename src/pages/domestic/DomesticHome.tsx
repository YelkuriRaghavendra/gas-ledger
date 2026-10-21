import { useCallback, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../../auth/AuthContext'
import { supabase } from '../../lib/supabase'
import { useProducts } from '../../hooks/useProducts'
import { useGodownStock } from '../../hooks/useGodownStock'
import { useDomesticSales, type DomesticBill } from '../../hooks/useDomesticSales'
import { useProfiles } from '../../hooks/useProfiles'
import { formatCurrency } from '../../utils/format'
import { getActivityIcon, getActivityTint } from '../../utils/activityIcon'
import { AppHeader } from '../../components/AppHeader'
import { ActivityBillDetail } from '../../components/ActivityBillDetail'
import type { FeedItem } from '../../hooks/useActivityFeed'
import { CylindersCard, type CardItem } from '../../components/CylindersCard'

function todayStartIso() {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d.toISOString()
}

function monthStartIso() {
  const d = new Date()
  d.setDate(1)
  d.setHours(0, 0, 0, 0)
  return d.toISOString()
}

// The shared bill popup is built around an activity-feed row, so describe the
// counter bill as one. A counter bill has no customer and settles on the spot.
function toFeedItem(b: DomesticBill): FeedItem {
  return {
    id: b.billId,
    customer_id: null,
    customer_name: null,
    type: b.type,
    product_id: b.lines[0]?.product_id ?? null,
    product_name: null,
    qty: b.lines.reduce((sum, l) => sum + l.qty, 0),
    empties: b.lines.reduce((sum, l) => sum + l.empties, 0),
    amount: b.total,
    note: b.note,
    created_by: b.createdBy,
    created_at: b.createdAt,
    updated_at: b.updatedAt,
    updated_by: b.updatedBy,
    outright: false,
    segment: 'domestic',
    bill_number: b.billNumber,
    method: b.method,
    paid: b.type === 'sale',
    nc_qty: 0,
    title: 'Counter bill',
  }
}

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

export function DomesticHome() {
  const [selected, setSelected] = useState<DomesticBill | null>(null)
  const [slide, setSlide] = useState(0)
  const touchRef = useRef<number | null>(null)
  const { profile } = useAuth()
  const isOwner = profile?.role === 'owner'
  const { data: products } = useProducts('domestic')
  const { data: stock, loading, error } = useGodownStock('domestic')
  const since = useMemo(todayStartIso, [])
  const monthSince = useMemo(monthStartIso, [])
  const { bills, refresh } = useDomesticSales(since)
  const { bills: monthBills } = useDomesticSales(monthSince)
  const profileNames = useProfiles()

  const productNameById = new Map(products.map((p) => [p.id, p.name]))
  const revenueToday = bills.reduce((sum, b) => sum + b.total, 0)
  const cashToday = bills.filter((b) => b.method === 'cash').reduce((s, b) => s + b.total, 0)
  const upiToday = bills.filter((b) => b.method === 'upi').reduce((s, b) => s + b.total, 0)
  const vitranToday = bills.filter((b) => b.method === 'vitran').reduce((s, b) => s + b.total, 0)

  const monthRevenue = monthBills.reduce((sum, b) => sum + b.total, 0)
  const monthCash = monthBills.filter((b) => b.method === 'cash').reduce((s, b) => s + b.total, 0)
  const monthUpi = monthBills.filter((b) => b.method === 'upi').reduce((s, b) => s + b.total, 0)
  const monthVitran = monthBills.filter((b) => b.method === 'vitran').reduce((s, b) => s + b.total, 0)
  const monthName = MONTH_NAMES[new Date().getMonth()]

  const onTouchStart = useCallback((e: React.TouchEvent) => {
    touchRef.current = e.touches[0].clientX
  }, [])
  const onTouchEnd = useCallback((e: React.TouchEvent) => {
    if (touchRef.current === null) return
    const diff = e.changedTouches[0].clientX - touchRef.current
    if (Math.abs(diff) > 50) setSlide((s) => (diff < 0 ? Math.min(s + 1, 1) : Math.max(s - 1, 0)))
    touchRef.current = null
  }, [])

  const cylinders = stock.filter((s) => s.kind === 'cylinder')

  const cylinderItems: CardItem[] = cylinders.map((s) => ({
    name: s.product_name,
    full: s.full_cylinders,
    empty: s.empty_cylinders,
  }))

  return (
    <div className="pb-[110px]">
      <AppHeader view="domestic" />

      <div className="px-4">
        {loading && <p className="text-muted">Loading…</p>}
        {error && <p className="text-red-600">{error}</p>}

        {!loading && !error && (
          <>
            <div
              className="relative overflow-hidden rounded-[26px] bg-gradient-to-br from-[#255C42] to-[#183F2D] shadow-float"
              onTouchStart={onTouchStart}
              onTouchEnd={onTouchEnd}
            >
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
              <div className="flex transition-transform duration-300 ease-out" style={{ transform: `translateX(-${slide * 100}%)` }}>
                <div className="w-full shrink-0 p-6 text-white">
                  <p className="relative text-[11px] font-bold uppercase tracking-[0.5px] text-[#9DC7AF]">Sales today</p>
                  <p className="relative mt-1 font-display text-[38px] font-bold leading-none tracking-[-1px] text-white">
                    {formatCurrency(revenueToday)}
                  </p>
                  <div className="relative mt-[15px] flex items-center gap-5">
                    <div>
                      <p className="text-[10px] font-semibold text-[#9DC7AF]">Cash</p>
                      <p className="mt-[1px] font-display text-[16px] font-semibold text-white">{formatCurrency(cashToday)}</p>
                    </div>
                    <div className="h-[26px] w-px bg-white/[.14]" />
                    <div>
                      <p className="text-[10px] font-semibold text-[#9DC7AF]">UPI</p>
                      <p className="mt-[1px] font-display text-[16px] font-semibold text-white">{formatCurrency(upiToday)}</p>
                    </div>
                    <div className="h-[26px] w-px bg-white/[.14]" />
                    <div>
                      <p className="text-[10px] font-semibold text-[#9DC7AF]">Vitran</p>
                      <p className="mt-[1px] font-display text-[16px] font-semibold text-white">{formatCurrency(vitranToday)}</p>
                    </div>
                  </div>
                </div>
                <div className="w-full shrink-0 p-6 text-white">
                  <p className="relative text-[11px] font-bold uppercase tracking-[0.5px] text-[#9DC7AF]">{monthName} summary</p>
                  <p className="relative mt-1 font-display text-[38px] font-bold leading-none tracking-[-1px] text-white">
                    {formatCurrency(monthRevenue)}
                  </p>
                  <div className="relative mt-[15px] flex items-center gap-5">
                    <div>
                      <p className="text-[10px] font-semibold text-[#9DC7AF]">Cash</p>
                      <p className="mt-[1px] font-display text-[16px] font-semibold text-white">{formatCurrency(monthCash)}</p>
                    </div>
                    <div className="h-[26px] w-px bg-white/[.14]" />
                    <div>
                      <p className="text-[10px] font-semibold text-[#9DC7AF]">UPI</p>
                      <p className="mt-[1px] font-display text-[16px] font-semibold text-white">{formatCurrency(monthUpi)}</p>
                    </div>
                    <div className="h-[26px] w-px bg-white/[.14]" />
                    <div>
                      <p className="text-[10px] font-semibold text-[#9DC7AF]">Vitran</p>
                      <p className="mt-[1px] font-display text-[16px] font-semibold text-white">{formatCurrency(monthVitran)}</p>
                    </div>
                  </div>
                </div>
              </div>
              <div className="flex justify-center gap-[6px] pb-3">
                <button type="button" onClick={() => setSlide(0)} className={`h-[6px] rounded-full transition-all ${slide === 0 ? 'w-[18px] bg-white/80' : 'w-[6px] bg-white/30'}`} />
                <button type="button" onClick={() => setSlide(1)} className={`h-[6px] rounded-full transition-all ${slide === 1 ? 'w-[18px] bg-white/80' : 'w-[6px] bg-white/30'}`} />
              </div>
            </div>

            <CylindersCard accent="green" linkLabel="All stock" linkTo="/domestic/stock" items={cylinderItems} />

            <div className="mb-3 mt-[18px] flex items-baseline justify-between">
              <h2 className="font-display text-[18px] font-bold tracking-[-0.3px] text-ink">Today's bills</h2>
              <Link to="/domestic/activity" className="text-[13px] font-bold text-[#2E8B57]">
                Activity ›
              </Link>
            </div>
            <ul className="flex flex-col gap-[10px]">
              {bills.map((b) => {
                const tint = getActivityTint(b.type)
                return (
                <li key={b.billId}>
                  <button
                    type="button"
                    onClick={() => setSelected(b)}
                    className="flex w-full items-center gap-[13px] rounded-[18px] bg-surface px-[15px] py-[13px] text-left shadow-card transition active:scale-[0.99]"
                  >
                    <div
                      className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[14px] text-lg"
                      style={{ backgroundColor: tint.bg, color: tint.color }}
                    >
                      {getActivityIcon(b.type)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[14px] font-bold text-ink">
                        {b.lines
                          .map((l) => `${l.qty} × ${l.product_id !== null ? productNameById.get(l.product_id) ?? 'item' : 'item'}`)
                          .join(', ')}
                      </p>
                      <p className="mt-[3px] text-[11.5px] font-semibold text-subtle">
                        {new Date(b.createdAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                      </p>
                    </div>
                    <p className="shrink-0 font-display text-[15px] font-bold" style={{ color: tint.color }}>{formatCurrency(b.total)}</p>
                  </button>
                </li>
                )
              })}
              {bills.length === 0 && (
                <li className="rounded-[18px] bg-surface px-[15px] py-8 text-center text-sm font-medium text-subtle shadow-card">
                  No sales yet today
                </li>
              )}
            </ul>
          </>
        )}
      </div>

      {selected && (
        <ActivityBillDetail
          item={toFeedItem(selected)}
          onClose={() => setSelected(null)}
          isOwner={isOwner}
          profileNames={profileNames}
          actions={
            isOwner ? (
              <>
                <Link
                  to={`/domestic/bill/${selected.billId}/edit`}
                  onClick={() => setSelected(null)}
                  className="flex h-[48px] flex-1 items-center justify-center rounded-[14px] bg-gradient-to-br from-[#3DA06A] to-[#2E8B57] font-bold text-white shadow-[0_10px_22px_-12px_rgba(46,139,87,0.7)] transition active:scale-[0.99]"
                >
                  Edit
                </Link>
                <button
                  type="button"
                  onClick={async () => {
                    if (!confirm('Delete this bill?')) return
                    const { error } = await supabase.from('bills').delete().eq('id', selected.billId)
                    if (!error) {
                      setSelected(null)
                      refresh()
                    }
                  }}
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
