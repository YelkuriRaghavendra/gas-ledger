import { useMemo, useState } from 'react'
import { AppHeader } from '../components/AppHeader'
import { HeroCard, HeroCardStats } from '../components/HeroCard'
import { ChevronLeftIcon } from '../components/icons'
import { useAuth } from '../auth/AuthContext'
import { useCommercialProfit } from '../hooks/useCommercialProfit'
import { useCustomerBalances } from '../hooks/useCustomerBalances'
import { useGodownStock } from '../hooks/useGodownStock'
import { usePurchaseOrders } from '../hooks/usePurchaseOrders'
import { useCommercialMonthStats } from '../hooks/useCommercialMonthStats'
import { currentMonthInIST, todayInIST } from '../hooks/useMonthSummary'
import { billsInWindow, profitByCustomer, profitByProduct, summariseProfit } from '../utils/profit'
import { unpaidFrom } from '../utils/reportsTrend'
import {
  agedDebtors,
  latestRates,
  paceThroughDay,
  perCylinder,
  stockValue,
  supplierDues,
} from '../utils/reportsPosition'
import { Statement } from '../components/reports/Statement'
import { PositionCard } from '../components/reports/PositionCard'
import { CashBar } from '../components/reports/CashBar'
import { ChaseList } from '../components/reports/ChaseList'
import { BreakdownList, type BreakdownRow } from '../components/reports/BreakdownList'
import { formatCurrency } from '../utils/format'

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

// The stats read the selected month and the one before it, nothing further back.
const STATS_MONTHS = 2

// Half-open [start, end) on the IST `day` column, matching the profit hook.
function monthBounds(year: number, month: number) {
  const pad = (n: number) => String(n).padStart(2, '0')
  const nextYear = month === 12 ? year + 1 : year
  const nextMonth = month === 12 ? 1 : month + 1
  return { start: `${year}-${pad(month)}-01`, end: `${nextYear}-${pad(nextMonth)}-01` }
}

export function Reports() {
  const { profile } = useAuth()
  const now = currentMonthInIST()
  const [year, setYear] = useState(now.year)
  const [month, setMonth] = useState(now.month)

  const { bills, history, lines, previousLines, loading, error, forbidden } = useCommercialProfit(year, month)
  const { data: balances } = useCustomerBalances()
  const { data: purchaseOrders } = usePurchaseOrders('commercial')
  const { data: stock } = useGodownStock('commercial')
  const { series } = useCommercialMonthStats(year, month, STATS_MONTHS)

  const atCurrentMonth = year === now.year && month === now.month
  const denied = forbidden || (profile != null && profile.role !== 'owner')
  const monthLabel = year === now.year ? MONTHS[month - 1] : `${MONTHS[month - 1]} ${year}`
  const previousMonth = month === 1 ? { year: year - 1, month: 12 } : { year, month: month - 1 }
  const previousLabel = MONTHS[previousMonth.month - 1]

  const summary = useMemo(() => summariseProfit(bills), [bills])
  const names = useMemo(() => new Map(balances.map((c) => [c.id, c.name])), [balances])
  const dues = useMemo(() => new Map(balances.map((c) => [c.id, c.amount_due])), [balances])

  const previousBills = useMemo(() => {
    const bounds = monthBounds(previousMonth.year, previousMonth.month)
    return billsInWindow(history, bounds.start, bounds.end)
  }, [history, previousMonth.year, previousMonth.month])
  const previousSummary = useMemo(() => summariseProfit(previousBills), [previousBills])

  // Month in progress: comparing 28 days against a full month reads as a
  // collapse, so the hero says where last month stood on the same date.
  const today = todayInIST()
  const dayOfMonth = Number(today.slice(8, 10))
  const monthInProgress = atCurrentMonth && dayOfMonth < 28
  const pace = useMemo(
    () => (monthInProgress ? paceThroughDay(previousBills, dayOfMonth) : null),
    [monthInProgress, previousBills, dayOfMonth],
  )

  const rate = perCylinder(summary.profit, summary.qty)
  const previousRate = perCylinder(previousSummary.profit, previousSummary.qty)

  const products = useMemo(() => profitByProduct(lines), [lines])
  const previousProducts = useMemo(() => profitByProduct(previousLines), [previousLines])
  const customers = useMemo(() => profitByCustomer(bills, names), [bills, names])
  const previousCustomers = useMemo(() => profitByCustomer(previousBills, names), [previousBills, names])

  const productRows: BreakdownRow[] = useMemo(() => {
    const before = new Map(previousProducts.map((p) => [p.productId, p.profit]))
    return products.map((p) => ({
      id: p.productId,
      name: p.name,
      qty: p.qty,
      profit: p.profit,
      previousProfit: before.get(p.productId) ?? null,
    }))
  }, [products, previousProducts])

  const customerRows: BreakdownRow[] = useMemo(() => {
    const before = new Map(previousCustomers.map((c) => [c.customerId, c.profit]))
    return customers.map((c) => {
      const due = dues.get(c.customerId) ?? 0
      return {
        id: c.customerId,
        name: c.name,
        qty: c.qty,
        profit: c.profit,
        previousProfit: before.get(c.customerId) ?? null,
        note: due > 0 ? `${formatCurrency(due)} due` : 'settled',
        noteTone: due > 0 ? ('warn' as const) : ('good' as const),
        to: `/commercial/customers/${c.customerId}`,
      }
    })
  }, [customers, previousCustomers, dues])

  // Debt ages against today, so it is only honest on the current month; an
  // older month would age its bills as they stood at that month's end.
  const debtors = useMemo(
    () => (atCurrentMonth ? agedDebtors(history, names, today).slice(0, 4) : []),
    [atCurrentMonth, history, names, today],
  )

  const owedToYou = useMemo(() => balances.reduce((sum, c) => sum + c.amount_due, 0), [balances])
  const owedToSupplier = useMemo(() => supplierDues(purchaseOrders), [purchaseOrders])
  const godownValue = useMemo(
    () => stockValue(stock, latestRates(purchaseOrders)),
    [stock, purchaseOrders],
  )

  const unpaid = useMemo(() => unpaidFrom(bills), [bills])

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
                <p className="text-[13px] font-semibold text-mutedOnDark">Gross profit</p>
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

              <p className="mt-[6px] font-display text-[40px] font-bold leading-none tracking-[-1.2px] tabular-nums">
                {formatCurrency(summary.profit)}
              </p>

              {/* The per-cylinder rate leads: total profit can rise on volume
                  while every cylinder earns less, and only this shows it. */}
              <p className="mt-[10px] text-[13px] font-semibold text-white/85">
                {rate != null ? `${formatCurrency(Math.round(rate))} a cylinder` : 'No cylinders sold'}
                {previousRate != null && rate != null && (
                  <span className="text-mutedOnDark">
                    {' · '}
                    {previousLabel} {formatCurrency(Math.round(previousRate))}
                  </span>
                )}
              </p>
              <p className="mt-[3px] text-[12px] font-semibold text-mutedOnDark">
                {summary.marginPct.toFixed(1)}% margin · {summary.qty} cylinders · excludes GST
              </p>

              {pace && (
                <p className="mt-[9px] text-[12px] font-semibold text-mutedOnDark">
                  Day {dayOfMonth} · {previousLabel} stood at{' '}
                  <span className="font-display font-bold text-white/85">{formatCurrency(pace.profit)}</span> by now
                </p>
              )}

              <HeroCardStats className="border-t border-white/[.14] pt-[12px]">
                <div>
                  <p className="text-[11px] font-semibold text-mutedOnDark">Realised</p>
                  <p className="mt-[1px] font-display text-[16px] font-semibold tabular-nums text-[#5FCF97]">
                    {formatCurrency(summary.realised)}
                  </p>
                </div>
                <div>
                  <p className="text-[11px] font-semibold text-mutedOnDark">Pending</p>
                  <p className="mt-[1px] font-display text-[16px] font-semibold tabular-nums text-[#EF9F27]">
                    {formatCurrency(summary.pending)}
                  </p>
                </div>
              </HeroCardStats>
            </HeroCard>

            <Statement
              revenue={summary.revenue}
              cost={summary.cost}
              profit={summary.profit}
              gstPayable={summary.gstPayable}
              previous={{
                revenue: previousSummary.revenue,
                cost: previousSummary.cost,
                profit: previousSummary.profit,
              }}
              againstLabel={previousLabel}
            />

            {summary.unknownCostBills > 0 && (
              <p className="mt-3 rounded-[14px] bg-[#FAEEDA] px-4 py-3 text-[12.5px] font-semibold leading-[1.45] text-[#854F0B]">
                {summary.unknownCostBills} bill{summary.unknownCostBills === 1 ? '' : 's'} left out — nothing was
                bought for those products yet, so their cost is unknown.
              </p>
            )}

            <CashBar
              collected={series.collected[series.collected.length - 1] ?? 0}
              unpaid={unpaid}
              cylindersSold={series.sold[series.sold.length - 1] ?? 0}
              cylindersBought={series.purchased[series.purchased.length - 1] ?? 0}
              emptiesIn={series.emptiesIn[series.emptiesIn.length - 1] ?? 0}
              emptiesOut={series.emptiesOut[series.emptiesOut.length - 1] ?? 0}
            />

            <PositionCard owedToYou={owedToYou} owedToSupplier={owedToSupplier} stock={godownValue} />

            <ChaseList debtors={debtors} />

            <BreakdownList
              title="Where the profit came from"
              rows={productRows}
              unit="cylinders"
              empty={`Nothing sold in ${monthLabel}.`}
            />

            <BreakdownList
              title="Who it came from"
              rows={customerRows}
              unit="cylinders"
              empty={`No customer bought in ${monthLabel}.`}
            />
          </>
        )}
      </div>
    </div>
  )
}
