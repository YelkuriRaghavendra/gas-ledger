import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { AppHeader } from '../components/AppHeader'
import { AccountMenu } from '../components/AccountMenu'
import { ChevronLeftIcon } from '../components/icons'
import { useAuth } from '../auth/AuthContext'
import { useCommercialProfit } from '../hooks/useCommercialProfit'
import { useCustomerBalances } from '../hooks/useCustomerBalances'
import { currentMonthInIST } from '../hooks/useMonthSummary'
import { profitByCustomer, profitByProduct, summariseProfit } from '../utils/profit'
import { formatCurrency } from '../utils/format'

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

export function Reports() {
  const { profile } = useAuth()
  const now = currentMonthInIST()
  const [year, setYear] = useState(now.year)
  const [month, setMonth] = useState(now.month)
  const [accountOpen, setAccountOpen] = useState(false)

  const { bills, lines, loading, error, forbidden } = useCommercialProfit(year, month)
  const { data: balances } = useCustomerBalances()

  const summary = useMemo(() => summariseProfit(bills), [bills])
  const names = useMemo(() => new Map(balances.map((c) => [c.id, c.name])), [balances])
  const dues = useMemo(() => new Map(balances.map((c) => [c.id, c.amount_due])), [balances])
  const customers = useMemo(() => profitByCustomer(bills, names), [bills, names])
  const products = useMemo(() => profitByProduct(lines), [lines])

  const atCurrentMonth = year === now.year && month === now.month
  const denied = forbidden || (profile != null && profile.role !== 'owner')

  function shiftMonth(delta: number) {
    const next = month + delta
    if (next < 1) { setMonth(12); setYear(year - 1) }
    else if (next > 12) { setMonth(1); setYear(year + 1) }
    else setMonth(next)
  }

  return (
    <div className="min-h-screen bg-cream pb-24">
      <AppHeader view="commercial" onOpenAccount={() => setAccountOpen(true)} title="Reports" />
      <AccountMenu open={accountOpen} onClose={() => setAccountOpen(false)} />

      <div className="px-4">
        {loading && !denied && <p className="text-muted">Loading…</p>}
        {denied && <p className="text-muted">Only the owner can view reports.</p>}
        {error && !denied && <p className="text-red-600">{error}</p>}

        {!loading && !denied && !error && (
          <>
            <div className="rounded-[26px] bg-gradient-to-br from-inkSoft to-ink p-6 text-white shadow-float">
              <div className="flex items-center justify-between">
                <p className="text-[11px] font-bold uppercase tracking-[0.5px] text-[#C9BBA8]">Gross profit</p>
                <div className="-mr-[5px] flex items-center gap-[2px]">
                  <button
                    type="button"
                    onClick={() => shiftMonth(-1)}
                    aria-label="Previous month"
                    className="grid h-[22px] w-[22px] place-items-center rounded-[7px] text-white/55 active:scale-90 active:bg-white/10"
                  >
                    <ChevronLeftIcon size={15} />
                  </button>
                  <span className="min-w-[62px] text-center font-display text-[12.5px] font-bold">
                    {MONTHS[month - 1]} {year}
                  </span>
                  <button
                    type="button"
                    onClick={() => shiftMonth(1)}
                    disabled={atCurrentMonth}
                    aria-label="Next month"
                    className="grid h-[22px] w-[22px] place-items-center rounded-[7px] text-white/55 active:scale-90 active:bg-white/10 disabled:opacity-20"
                  >
                    <span className="rotate-180"><ChevronLeftIcon size={15} /></span>
                  </button>
                </div>
              </div>

              <p className="mt-1 font-display text-[38px] font-bold leading-none tracking-[-1px]">
                {formatCurrency(summary.profit)}
              </p>
              <p className="mt-[9px] text-[12.5px] font-semibold text-mutedOnDark">
                {summary.marginPct.toFixed(1)}% margin · {summary.qty} cylinders · excludes GST
              </p>

              <div className="mt-[15px] flex items-center gap-5 border-t border-white/[.14] pt-[12px]">
                <div>
                  <p className="text-[10px] font-semibold text-mutedOnDark">Realised</p>
                  <p className="mt-[1px] font-display text-[16px] font-semibold text-[#5FCF97]">
                    {formatCurrency(summary.realised)}
                  </p>
                </div>
                <div className="h-[26px] w-px bg-white/[.14]" />
                <div>
                  <p className="text-[10px] font-semibold text-mutedOnDark">Pending</p>
                  <p className="mt-[1px] font-display text-[16px] font-semibold text-[#EF9F27]">
                    {formatCurrency(summary.pending)}
                  </p>
                </div>
              </div>
            </div>

            <div className="mt-3 grid grid-cols-3 gap-2">
              <Tile label="Revenue" value={formatCurrency(summary.revenue)} />
              <Tile label="Cost" value={formatCurrency(summary.cost)} />
              <Tile label="GST payable" value={formatCurrency(summary.gstPayable)} />
            </div>

            {summary.unknownCostBills > 0 && (
              <p className="mt-3 rounded-[12px] bg-[#FAEEDA] px-3 py-2 text-[12px] font-semibold text-[#854F0B]">
                {summary.unknownCostBills} bill{summary.unknownCostBills === 1 ? '' : 's'} excluded — no purchase
                recorded for those products, so cost is unknown.
              </p>
            )}

            <div className="mt-3 rounded-[16px] bg-surface p-3 shadow-card">
              <p className="mb-[9px] text-[10px] font-bold uppercase tracking-[0.5px] text-muted">By product</p>
              {products.length === 0 && <p className="text-[13px] text-muted">No sales this month.</p>}
              {products.map((p, i) => (
                <div
                  key={p.productId}
                  className={`flex items-baseline justify-between py-[7px] ${
                    i < products.length - 1 ? 'border-b border-borderMuted' : ''
                  }`}
                >
                  <span className="text-[13px] font-bold text-ink">
                    {p.name} <span className="font-semibold text-subtle">· {p.qty}</span>
                  </span>
                  <span className="text-[13px] font-bold text-ink">{formatCurrency(p.profit)}</span>
                </div>
              ))}
            </div>

            <div className="mt-3 rounded-[16px] bg-surface p-3 shadow-card">
              <div className="mb-[10px] flex items-center justify-between">
                <p className="text-[10px] font-bold uppercase tracking-[0.5px] text-muted">By customer</p>
                <p className="text-[10px] font-bold uppercase tracking-[0.5px] text-subtle">Profit / due</p>
              </div>

              {customers.length === 0 && <p className="text-[13px] text-muted">No sales this month.</p>}

              {customers.map((c, i) => {
                const due = dues.get(c.customerId) ?? 0
                return (
                  <Link
                    key={c.customerId}
                    to={`/commercial/customers/${c.customerId}`}
                    className={`flex items-center justify-between py-[9px] ${
                      i < customers.length - 1 ? 'border-b border-borderMuted' : ''
                    }`}
                  >
                    <div>
                      <p className="text-[13px] font-bold text-ink">{c.name}</p>
                      <p className="mt-[1px] text-[11px] font-semibold text-subtle">{c.qty} cylinders</p>
                    </div>
                    <div className="text-right">
                      <p className="text-[13px] font-bold text-ink">{formatCurrency(c.profit)}</p>
                      <p className={`mt-[1px] text-[11px] font-semibold ${due > 0 ? 'text-[#A32D2D]' : 'text-[#1D9E75]'}`}>
                        {due > 0 ? `${formatCurrency(due)} due` : 'settled'}
                      </p>
                    </div>
                  </Link>
                )
              })}
            </div>
          </>
        )}
      </div>
    </div>
  )
}

function Tile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[12px] bg-surface px-3 py-[11px] shadow-card">
      <p className="text-[10px] font-bold uppercase tracking-[0.4px] text-muted">{label}</p>
      <p className="mt-[2px] font-display text-[15px] font-bold text-ink">{value}</p>
    </div>
  )
}
