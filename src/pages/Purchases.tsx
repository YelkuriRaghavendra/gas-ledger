import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { supabase } from '../lib/supabase'
import { useProducts } from '../hooks/useProducts'
import { usePurchaseOrders, type PurchaseOrderWithLines } from '../hooks/usePurchaseOrders'
import { useProfiles } from '../hooks/useProfiles'
import { currentMonthInIST } from '../hooks/useMonthSummary'
import { formatCurrency } from '../utils/format'
import {
  groupPurchasesByDay,
  purchaseSubtitle,
  purchaseTitle,
  purchasesInMonth,
  summarisePurchases,
} from '../utils/purchases'
import { ChevronLeftIcon, PlusIcon } from '../components/icons'
import { AppHeader } from '../components/AppHeader'
import { AccountMenu } from '../components/AccountMenu'
import { PurchaseDetail } from '../components/PurchaseDetail'
import truckMark from '../assets/truck.png'

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

export function Purchases() {
  const { profile } = useAuth()
  const navigate = useNavigate()
  const isOwner = profile?.role === 'owner'
  const { data: products } = useProducts()
  const { data: purchaseOrders, refresh } = usePurchaseOrders()
  const [accountOpen, setAccountOpen] = useState(false)
  const [selected, setSelected] = useState<PurchaseOrderWithLines | null>(null)
  const profileNames = useProfiles()

  // Which month the tab is showing; starts on the current one, same as Home.
  const [viewYear, setViewYear] = useState(() => currentMonthInIST().year)
  const [viewMonth, setViewMonth] = useState(() => currentMonthInIST().month)
  const nowIST = currentMonthInIST()
  const atCurrentMonth = viewYear === nowIST.year && viewMonth === nowIST.month
  // Only spell out the year once it stops being the obvious one.
  const monthLabel =
    viewYear === nowIST.year ? MONTH_NAMES[viewMonth - 1] : `${MONTH_NAMES[viewMonth - 1]} ${viewYear}`

  function shiftMonth(by: number) {
    const d = new Date(viewYear, viewMonth - 1 + by, 1)
    setViewYear(d.getFullYear())
    setViewMonth(d.getMonth() + 1)
  }

  const productNameById = useMemo(
    () => new Map(products.map((p) => [p.id, p.name])),
    [products],
  )
  const monthOrders = useMemo(
    () => purchasesInMonth(purchaseOrders, viewYear, viewMonth),
    [purchaseOrders, viewYear, viewMonth],
  )
  const summary = useMemo(() => summarisePurchases(monthOrders), [monthOrders])
  const groups = useMemo(() => groupPurchasesByDay(monthOrders), [monthOrders])

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
        <div className="mb-[14px] flex items-center justify-between">
          <h1 className="font-display text-2xl font-bold tracking-[-0.4px] text-ink">Purchases</h1>
          <Link
            to="/commercial/purchases/new"
            aria-label="New purchase"
            className="flex h-10 w-10 items-center justify-center rounded-[13px] bg-gradient-to-br from-accentSoft to-accent shadow-glow"
          >
            <PlusIcon size={20} strokeWidth={2.4} color="#fff" />
          </Link>
        </div>

        <div className="mb-[14px] rounded-[20px] bg-ink px-[18px] py-4 text-white">
          <div className="flex items-center justify-between">
            <p className="text-[11px] font-bold uppercase tracking-[0.5px] text-[#C9BBA8]">Spent in</p>
            {/* Pulled tight to the card edge; the negative margin cancels the
                arrow buttons' own padding so the glyph optically lines up with
                the content edge below. */}
            <div className="-mr-[5px] flex items-center gap-[2px]">
              <button
                type="button"
                onClick={() => shiftMonth(-1)}
                aria-label="Previous month"
                className="grid h-[22px] w-[22px] place-items-center rounded-[7px] text-white/55 transition active:scale-90 active:bg-white/10"
              >
                <ChevronLeftIcon size={15} />
              </button>
              <span className="min-w-[52px] text-center font-display text-[12.5px] font-bold text-white">
                {monthLabel}
              </span>
              <button
                type="button"
                onClick={() => shiftMonth(1)}
                disabled={atCurrentMonth}
                aria-label="Next month"
                className="grid h-[22px] w-[22px] place-items-center rounded-[7px] text-white/55 transition active:scale-90 active:bg-white/10 disabled:opacity-20"
              >
                <span className="rotate-180">
                  <ChevronLeftIcon size={15} />
                </span>
              </button>
            </div>
          </div>

          <p className="mt-1 font-display text-[30px] font-bold leading-none tracking-[-0.7px]">
            {formatCurrency(summary.spend)}
          </p>
          <p className="mt-[5px] text-[11px] font-semibold text-mutedOnDark">
            across {summary.orderCount} {summary.orderCount === 1 ? 'order' : 'orders'}
          </p>
          <div className="mt-[14px] flex gap-[10px] border-t border-[#3A2F26] pt-[13px]">
            <Stat value={String(summary.cylindersIn)} label="Cylinders in" />
            <Stat value={String(summary.emptiesOut)} label="Empties out" />
            <Stat value={formatCurrency(summary.avgPerCylinder)} label="Avg / cyl" />
          </div>
        </div>

        {groups.map((group) => (
          <div key={group.key} className="mb-[9px]">
            <div className="flex items-baseline justify-between px-[2px] pb-[9px] pt-[6px]">
              <span className="text-[10px] font-extrabold uppercase tracking-[0.7px] text-subtle">
                {group.label}
              </span>
              <span className="text-[10.5px] font-bold text-subtle">{formatCurrency(group.subtotal)}</span>
            </div>
            <ul className="flex flex-col gap-[9px]">
              {group.orders.map((po) => (
                <li key={po.id}>
                  <button
                    type="button"
                    onClick={() => setSelected(po)}
                    className="flex w-full items-center gap-3 rounded-[16px] bg-surface px-[14px] py-[13px] text-left shadow-card transition active:scale-[0.99]"
                  >
                    <img
                      src={truckMark}
                      alt=""
                      className="h-[38px] w-[38px] shrink-0 object-contain"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13.5px] font-extrabold leading-[1.25] text-ink">
                        {purchaseTitle(po, productNameById)}
                      </p>
                      <p className="mt-[3px] truncate text-[10.5px] font-bold text-subtle">
                        {purchaseSubtitle(po)}
                      </p>
                    </div>
                    <p className="shrink-0 font-display text-[14.5px] font-bold text-ink">
                      {formatCurrency(po.total_amount)}
                    </p>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ))}

        {monthOrders.length === 0 && (
          <div className="flex flex-col items-center px-4 pb-10 pt-12 text-center">
            <img src={truckMark} alt="" className="h-[84px] w-[84px] object-contain" />
            <h2 className="mt-5 font-display text-[19px] font-bold tracking-[-0.2px] text-ink">
              {purchaseOrders.length === 0 ? 'No purchases yet' : `Nothing bought in ${monthLabel}`}
            </h2>
            <p className="mt-2 max-w-[250px] text-[13px] font-semibold leading-[1.5] text-muted">
              {purchaseOrders.length === 0
                ? 'Record what you buy from the supplier — cylinders in, empties back, and what it cost.'
                : 'Use the arrows above to look at another month.'}
            </p>
            {purchaseOrders.length === 0 && (
              <Link
                to="/commercial/purchases/new"
                className="mt-[22px] flex h-[50px] items-center gap-2 rounded-[15px] bg-gradient-to-br from-accentSoft to-accent px-6 text-sm font-extrabold text-white shadow-glow transition active:scale-[0.99]"
              >
                <PlusIcon size={17} strokeWidth={2.6} color="#fff" />
                Record a purchase
              </Link>
            )}
          </div>
        )}
      </div>

      {selected && (
        <PurchaseDetail
          purchase={selected}
          productNameById={productNameById}
          profileNames={profileNames}
          isOwner={isOwner}
          onClose={() => setSelected(null)}
          onEdit={() => {
            const id = selected.id
            setSelected(null)
            navigate(`/commercial/purchases/${id}/edit`)
          }}
          onDelete={() => handleDelete(selected.id)}
        />
      )}
    </div>
  )
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div className="flex-1">
      <p className="font-display text-[17px] font-bold leading-none">{value}</p>
      <p className="mt-1 text-[10px] font-bold uppercase tracking-[0.3px] text-mutedOnDark">{label}</p>
    </div>
  )
}
