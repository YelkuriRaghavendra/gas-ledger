import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { AppHeader } from '../components/AppHeader'
import { HeroCard, HeroCardStats } from '../components/HeroCard'
import { ChevronLeftIcon } from '../components/icons'
import { useAuth } from '../auth/AuthContext'
import { useCommercialProfit } from '../hooks/useCommercialProfit'
import { useCustomerBalances } from '../hooks/useCustomerBalances'
import { currentMonthInIST } from '../hooks/useMonthSummary'
import { billsInWindow, profitByCustomer, profitByProduct, summariseProfit } from '../utils/profit'
import { useCommercialMonthStats } from '../hooks/useCommercialMonthStats'
import { monthWindow, profitTrend, rankMovers, unpaidFrom } from '../utils/reportsTrend'
import { TrendChart } from '../components/reports/TrendChart'
import { StatTile } from '../components/reports/StatTile'
import { MoversList } from '../components/reports/MoversList'
import { formatCurrency } from '../utils/format'

const TREND_MONTHS = 12

// Half-open [start, end) on the IST `day` column, matching the profit hook.
function monthBounds(year: number, month: number) {
  const pad = (n: number) => String(n).padStart(2, '0')
  const nextYear = month === 12 ? year + 1 : year
  const nextMonth = month === 12 ? 1 : month + 1
  return { start: `${year}-${pad(month)}-01`, end: `${nextYear}-${pad(nextMonth)}-01` }
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

export function Reports() {
  const { profile } = useAuth()
  const now = currentMonthInIST()
  const [year, setYear] = useState(now.year)
  const [month, setMonth] = useState(now.month)

  const { bills, history, lines, previousLines, loading, error, forbidden } = useCommercialProfit(year, month)
  const { data: balances } = useCustomerBalances()
  const { window: trendWindow, series } = useCommercialMonthStats(year, month, TREND_MONTHS)

  const summary = useMemo(() => summariseProfit(bills), [bills])
  const names = useMemo(() => new Map(balances.map((c) => [c.id, c.name])), [balances])
  const dues = useMemo(() => new Map(balances.map((c) => [c.id, c.amount_due])), [balances])
  const customers = useMemo(() => profitByCustomer(bills, names), [bills, names])
  const products = useMemo(() => profitByProduct(lines), [lines])

  // The trend is a slice of the settlement history the profit hook already
  // holds, so moving through the chart costs no further queries.
  const trend = useMemo(
    () => profitTrend(history, monthWindow(year, month, TREND_MONTHS)),
    [history, year, month],
  )
  const selectedKey = `${year}-${String(month).padStart(2, '0')}`

  // Index of the month on screen and the one before it, shared by every delta.
  const at = trendWindow.length - 1
  const previousAt = at - 1
  const previousLabel = trendWindow[previousAt]?.label ?? ''
  const valueAt = (numbers: number[], index: number) => (index >= 0 ? numbers[index] ?? 0 : 0)

  const previousBills = useMemo(() => {
    const previousMonth = month === 1 ? { year: year - 1, month: 12 } : { year, month: month - 1 }
    const bounds = monthBounds(previousMonth.year, previousMonth.month)
    return billsInWindow(history, bounds.start, bounds.end)
  }, [history, year, month])

  const previousSummary = useMemo(() => summariseProfit(previousBills), [previousBills])
  const unpaid = useMemo(() => unpaidFrom(bills), [bills])
  const previousUnpaid = useMemo(() => unpaidFrom(previousBills), [previousBills])
  const outstanding = useMemo(() => balances.reduce((sum, c) => sum + c.amount_due, 0), [balances])

  const customerMovers = useMemo(() => {
    const toInput = (rows: ReturnType<typeof profitByCustomer>) =>
      rows.map((c) => ({ id: c.customerId, name: c.name, value: c.profit }))
    return rankMovers(toInput(customers), toInput(profitByCustomer(previousBills, names)))
  }, [customers, previousBills, names])

  const productMovers = useMemo(() => {
    const toInput = (rows: ReturnType<typeof profitByProduct>) =>
      rows.map((p) => ({ id: p.productId, name: p.name, value: p.profit }))
    return rankMovers(toInput(products), toInput(profitByProduct(previousLines)))
  }, [products, previousLines])

  const atCurrentMonth = year === now.year && month === now.month
  const denied = forbidden || (profile != null && profile.role !== 'owner')
  const monthLabel = year === now.year ? MONTHS[month - 1] : `${MONTHS[month - 1]} ${year}`

  function shiftMonth(delta: number) {
    const next = month + delta
    if (next < 1) { setMonth(12); setYear(year - 1) }
    else if (next > 12) { setMonth(1); setYear(year + 1) }
    else setMonth(next)
  }

  return (
    <div className="min-h-screen bg-cream pb-24">
      <AppHeader view="commercial" title="Reports" />

      <div className="px-4">
        {loading && !denied && <p className="text-muted">Loading…</p>}
        {denied && <p className="text-muted">Only the owner can view reports.</p>}
        {error && !denied && <p className="text-red-600">{error}</p>}

        {!loading && !denied && !error && (
          <>
            <HeroCard className="p-6">
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
                  <span className="min-w-[52px] text-center font-display text-[12.5px] font-bold">
                    {monthLabel}
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

              <HeroCardStats className="border-t border-white/[.14] pt-[12px]">
                <div>
                  <p className="text-[10px] font-semibold text-mutedOnDark">Realised</p>
                  <p className="mt-[1px] font-display text-[16px] font-semibold text-[#5FCF97]">
                    {formatCurrency(summary.realised)}
                  </p>
                </div>
                <div>
                  <p className="text-[10px] font-semibold text-mutedOnDark">Pending</p>
                  <p className="mt-[1px] font-display text-[16px] font-semibold text-[#EF9F27]">
                    {formatCurrency(summary.pending)}
                  </p>
                </div>
              </HeroCardStats>
            </HeroCard>

            <TrendChart
              points={trend}
              selectedKey={selectedKey}
              onSelect={(point) => {
                setYear(point.year)
                setMonth(point.month)
              }}
            />

            <div className="mt-3 grid grid-cols-3 gap-2">
              <StatTile
                label="Revenue"
                value={formatCurrency(summary.revenue)}
                current={summary.revenue}
                previous={previousSummary.revenue}
                againstLabel={previousLabel}
              />
              <StatTile
                label="Cost"
                value={formatCurrency(summary.cost)}
                current={summary.cost}
                previous={previousSummary.cost}
                againstLabel={previousLabel}
                lowerIsBetter
              />
              <StatTile label="GST payable" value={formatCurrency(summary.gstPayable)} />
            </div>

            <p className="mt-4 px-1 text-[10px] font-bold uppercase tracking-[0.5px] text-muted">Cash</p>
            <div className="mt-[6px] grid grid-cols-3 gap-2">
              <StatTile
                label="Collected"
                value={formatCurrency(valueAt(series.collected, at))}
                current={valueAt(series.collected, at)}
                previous={valueAt(series.collected, previousAt)}
                againstLabel={previousLabel}
              />
              <StatTile
                label="Unpaid"
                value={formatCurrency(unpaid)}
                current={unpaid}
                previous={previousUnpaid}
                againstLabel={previousLabel}
                lowerIsBetter
              />
              <StatTile label="Outstanding" value={formatCurrency(outstanding)} />
            </div>

            <p className="mt-4 px-1 text-[10px] font-bold uppercase tracking-[0.5px] text-muted">
              Cylinders &amp; empties
            </p>
            <div className="mt-[6px] grid grid-cols-3 gap-2">
              <StatTile
                label="Sold"
                value={String(valueAt(series.sold, at))}
                current={valueAt(series.sold, at)}
                previous={valueAt(series.sold, previousAt)}
                againstLabel={previousLabel}
              />
              <StatTile
                label="Bought"
                value={String(valueAt(series.purchased, at))}
                current={valueAt(series.purchased, at)}
                previous={valueAt(series.purchased, previousAt)}
                againstLabel={previousLabel}
              />
              <StatTile
                label="Spend"
                value={formatCurrency(valueAt(series.purchaseSpend, at))}
                current={valueAt(series.purchaseSpend, at)}
                previous={valueAt(series.purchaseSpend, previousAt)}
                againstLabel={previousLabel}
                lowerIsBetter
              />
            </div>
            <div className="mt-2 grid grid-cols-3 gap-2">
              <StatTile label="Empties in" value={String(valueAt(series.emptiesIn, at))} />
              <StatTile label="Empties out" value={String(valueAt(series.emptiesOut, at))} />
              <StatTile
                label="Net empties"
                value={String(valueAt(series.emptiesIn, at) - valueAt(series.emptiesOut, at))}
              />
            </div>

            <MoversList
              title="Customer movers"
              risers={customerMovers.risers}
              fallers={customerMovers.fallers}
              againstLabel={previousLabel}
              linkTo={(mover) => `/commercial/customers/${mover.id}`}
            />

            <MoversList
              title="Product movers"
              risers={productMovers.risers}
              fallers={productMovers.fallers}
              againstLabel={previousLabel}
            />

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
