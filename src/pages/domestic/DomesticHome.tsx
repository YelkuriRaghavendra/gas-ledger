import { useCallback, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../../auth/AuthContext'
import { supabase } from '../../lib/supabase'
import { useProducts } from '../../hooks/useProducts'
import { useGodownStock } from '../../hooks/useGodownStock'
import { useDomesticSales, type DomesticBill } from '../../hooks/useDomesticSales'
import { useProfiles } from '../../hooks/useProfiles'
import { formatCurrency, formatDate, formatUpdated } from '../../utils/format'
import { AppHeader } from '../../components/AppHeader'
import { AccountMenu } from '../../components/AccountMenu'
import { DetailModal } from '../../components/DetailModal'
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

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

export function DomesticHome() {
  const [accountOpen, setAccountOpen] = useState(false)
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
      <AppHeader view="domestic" onOpenAccount={() => setAccountOpen(true)} />
      <AccountMenu open={accountOpen} onClose={() => setAccountOpen(false)} />

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
              <Link to="/domestic/history" className="text-[13px] font-bold text-[#2E8B57]">
                History ›
              </Link>
            </div>
            <ul className="flex flex-col gap-[10px]">
              {bills.map((b) => (
                <li key={b.billId}>
                  <button
                    type="button"
                    onClick={() => setSelected(b)}
                    className="flex w-full items-center gap-3 rounded-[18px] bg-surface px-[15px] py-[13px] text-left shadow-card transition active:scale-[0.99]"
                  >
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
                    <p className="shrink-0 font-display text-[15px] font-bold text-[#2E8B57]">{formatCurrency(b.total)}</p>
                  </button>
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
          rows={[
            { k: 'Bill number', v: selected.billNumber },
            ...(selected.method ? [{ k: 'Payment', v: selected.method === 'upi' ? 'UPI' : selected.method === 'vitran' ? 'Vitran' : 'Cash' }] : []),
            ...selected.lines.map((l) => {
              const name = l.product_id !== null ? productNameById.get(l.product_id) ?? 'item' : 'item'
              const delivered = l.delivered ? '' : ' (pending)'
              return { k: `${l.qty} × ${name}${delivered}`, v: formatCurrency(l.amount) }
            }),
            ...(selected.lines.reduce((s, l) => s + l.empties, 0) > 0
              ? [{ k: 'Empties received', v: String(selected.lines.reduce((s, l) => s + l.empties, 0)) }]
              : []),
            ...(selected.note ? [{ k: 'Note', v: selected.note }] : []),
          ]}
          created={formatDate(selected.createdAt)}
          createdBy={selected.lines[0].created_by ? profileNames.get(selected.lines[0].created_by) : undefined}
          updated={formatUpdated(
            selected.lines.reduce((max, l) => (l.updated_at > max ? l.updated_at : max), selected.lines[0].updated_at),
            selected.createdAt,
          )}
          updatedBy={(() => {
            const latest = selected.lines.reduce((a, b) => (b.updated_at > a.updated_at ? b : a), selected.lines[0])
            return latest.updated_by ? profileNames.get(latest.updated_by) : undefined
          })()}
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
