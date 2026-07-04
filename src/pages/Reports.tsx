import { useMemo, useState } from 'react'
import { useDailySummary } from '../hooks/useDailySummary'
import { useMonthlySummary } from '../hooks/useMonthlySummary'
import { useRevenueTrend } from '../hooks/useRevenueTrend'
import { useProducts } from '../hooks/useProducts'
import { formatCurrency, formatDate } from '../utils/format'
import { HeroCard } from '../components/HeroCard'

type Period = 'today' | 'month'
type TrendWindow = 7 | 30

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

function SegmentedControl<T extends string | number>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[]
  value: T
  onChange: (v: T) => void
}) {
  return (
    <div className="inline-flex rounded-full bg-white p-1">
      {options.map((opt) => (
        <button
          key={String(opt.value)}
          type="button"
          onClick={() => onChange(opt.value)}
          className={`rounded-full px-4 py-[7px] text-[13px] font-bold transition-colors ${
            value === opt.value ? 'bg-accent text-white' : 'text-muted'
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  )
}

export function Reports() {
  const [period, setPeriod] = useState<Period>('today')
  const [trendWindow, setTrendWindow] = useState<TrendWindow>(7)

  const daily = useDailySummary()
  const monthly = useMonthlySummary()
  const trend = useRevenueTrend(trendWindow)
  const { data: products } = useProducts()

  const loading = period === 'today' ? daily.loading : monthly.loading
  const error = period === 'today' ? daily.error : monthly.error

  const hasPurchases = period === 'today' ? daily.purchases.length > 0 : monthly.purchases.length > 0

  const totals = useMemo(() => {
    if (period === 'today') {
      const revenue = daily.products.reduce((sum, p) => sum + p.revenue, 0)
      const collectedAtSale = daily.products.reduce((sum, p) => sum + p.collected_at_sale, 0)
      const paymentsCollected = daily.money?.payments_collected ?? 0
      const sold = daily.products.reduce((sum, p) => sum + p.cylinders_sold, 0)
      const emptiesIn = daily.products.reduce((sum, p) => sum + p.empties_collected, 0)
      const purchased = daily.purchases.reduce((sum, p) => sum + p.cylinders_purchased, 0)
      return { revenue, collected: collectedAtSale + paymentsCollected, sold, emptiesIn, purchased }
    }
    const revenue = monthly.products.reduce((sum, p) => sum + p.revenue, 0)
    const collectedAtSale = monthly.products.reduce((sum, p) => sum + p.collected_at_sale, 0)
    const paymentsCollected = monthly.money?.payments_collected ?? 0
    const sold = monthly.products.reduce((sum, p) => sum + p.cylinders_sold, 0)
    const emptiesIn = monthly.products.reduce((sum, p) => sum + p.empties_collected, 0)
    const purchased = monthly.purchases.reduce((sum, p) => sum + p.cylinders_purchased, 0)
    return { revenue, collected: collectedAtSale + paymentsCollected, sold, emptiesIn, purchased }
  }, [period, daily, monthly])

  const monthOverMonth = useMemo(() => {
    if (period !== 'month') return null
    const thisRevenue = monthly.products.reduce((sum, p) => sum + p.revenue, 0)
    const lastRevenue = monthly.previousProducts.reduce((sum, p) => sum + p.revenue, 0)
    return { thisRevenue, lastRevenue }
  }, [period, monthly])

  const maxTrendRevenue = Math.max(1, ...trend.data.map((d) => d.revenue))
  const trendStart = trend.data[0]?.day
  const trendEnd = trend.data[trend.data.length - 1]?.day

  function productRow(productId: number, productName: string) {
    const rows = period === 'today' ? daily.products : monthly.products
    const row = rows.find((r) => r.product_id === productId)
    return {
      name: productName,
      sold: row?.cylinders_sold ?? 0,
      revenue: row?.revenue ?? 0,
      emptiesIn: row?.empties_collected ?? 0,
    }
  }

  function purchaseRow(productId: number) {
    const rows = period === 'today' ? daily.purchases : monthly.purchases
    return rows
      .filter((r) => r.product_id === productId)
      .reduce(
        (acc, r) => ({
          purchased: acc.purchased + r.cylinders_purchased,
          emptiesGiven: acc.emptiesGiven + r.empties_given_to_supplier,
        }),
        { purchased: 0, emptiesGiven: 0 },
      )
  }

  return (
    <div className="p-5 pb-[110px] pt-2">
      <h1 className="mb-4 font-display text-2xl font-bold tracking-[-0.4px] text-ink">Reports</h1>

      <div className="mb-4">
        <SegmentedControl
          value={period}
          onChange={setPeriod}
          options={[
            { value: 'today', label: 'Today' },
            { value: 'month', label: 'This month' },
          ]}
        />
      </div>

      {loading && <p className="text-muted">Loading…</p>}
      {error && <p className="text-red-600">{error}</p>}

      {!loading && !error && (
        <>
          <HeroCard>
            <p className="relative text-[13px] font-semibold text-[#C9BBA8]">
              {period === 'today' ? 'Revenue today' : 'Revenue this month'}
            </p>
            <p className="relative font-display text-[42px] font-bold leading-none text-white">
              {formatCurrency(totals.revenue)}
            </p>
            <p className="relative mt-[7px] text-[12.5px] font-semibold text-mutedOnDark">
              collected: {formatCurrency(totals.collected)}
            </p>
            {period === 'month' && monthOverMonth && monthOverMonth.lastRevenue > 0 && (
              <p className="relative mt-[2px] text-[12.5px] font-semibold text-mutedOnDark">
                {(() => {
                  const pct = Math.round(
                    ((monthOverMonth.thisRevenue - monthOverMonth.lastRevenue) / monthOverMonth.lastRevenue) * 100,
                  )
                  return `${pct >= 0 ? '+' : ''}${pct}% from last month`
                })()}
              </p>
            )}
            <div className="relative mt-[18px] flex items-center gap-4">
              <div>
                <p className="text-xs font-semibold text-mutedOnDark">Sold</p>
                <p className="font-display text-[19px] font-semibold text-white">{totals.sold}</p>
              </div>
              <div className="h-[30px] w-px bg-white/[.14]" />
              <div>
                <p className="text-xs font-semibold text-mutedOnDark">Empties in</p>
                <p className="font-display text-[19px] font-semibold text-[#5FCF97]">{totals.emptiesIn}</p>
              </div>
              {hasPurchases && (
                <>
                  <div className="h-[30px] w-px bg-white/[.14]" />
                  <div>
                    <p className="text-xs font-semibold text-mutedOnDark">Purchased</p>
                    <p className="font-display text-[19px] font-semibold text-[#FF8A4C]">{totals.purchased}</p>
                  </div>
                </>
              )}
            </div>
          </HeroCard>

          <div className="mt-[14px] rounded-[20px] border border-[#EFE7D8] bg-white p-5">
            <h2 className="mb-3 font-display text-[17px] font-semibold text-ink">By product</h2>
            <div className="flex flex-col gap-3">
              {products.map((p) => {
                const row = productRow(p.id, p.name)
                return (
                  <div key={p.id} className="flex items-center justify-between border-b border-[#F1E9DB] pb-3 last:border-0 last:pb-0">
                    <p className="text-sm font-bold text-ink">{row.name}</p>
                    <div className="flex items-center gap-4 text-right">
                      <div>
                        <p className="text-[10px] font-semibold uppercase text-muted">Sold</p>
                        <p className="text-sm font-bold text-ink">{row.sold}</p>
                      </div>
                      <div>
                        <p className="text-[10px] font-semibold uppercase text-muted">Revenue</p>
                        <p className="text-sm font-bold text-ink">{formatCurrency(row.revenue)}</p>
                      </div>
                      <div>
                        <p className="text-[10px] font-semibold uppercase text-muted">Empties in</p>
                        <p className="text-sm font-bold text-ink">{row.emptiesIn}</p>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>

            {hasPurchases && (
              <div className="mt-4 rounded-2xl bg-cream p-4">
                <h3 className="mb-3 text-xs font-bold uppercase tracking-wide text-muted">Purchased from supplier</h3>
                <div className="flex flex-col gap-3">
                  {products.map((p) => {
                    const row = purchaseRow(p.id)
                    return (
                      <div key={p.id} className="flex items-center justify-between">
                        <p className="text-sm font-bold text-ink">{p.name}</p>
                        <div className="flex items-center gap-4 text-right">
                          <div>
                            <p className="text-[10px] font-semibold uppercase text-muted">Purchased</p>
                            <p className="text-sm font-bold text-ink">{row.purchased}</p>
                          </div>
                          <div>
                            <p className="text-[10px] font-semibold uppercase text-muted">Empties given</p>
                            <p className="text-sm font-bold text-ink">{row.emptiesGiven}</p>
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </div>

          <div className="mt-[14px] rounded-[20px] border border-[#EFE7D8] bg-white p-5">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="font-display text-[17px] font-semibold text-ink">Revenue trend</h2>
              <SegmentedControl
                value={trendWindow}
                onChange={setTrendWindow}
                options={[
                  { value: 7, label: '7 days' },
                  { value: 30, label: '30 days' },
                ]}
              />
            </div>

            {trend.loading && <p className="text-muted">Loading…</p>}
            {trend.error && <p className="text-red-600">{trend.error}</p>}

            {!trend.loading && !trend.error && (
              <>
                <div className="flex h-[120px] items-end gap-1">
                  {trend.data.map((d) => {
                    const pct = Math.max(4, (d.revenue / maxTrendRevenue) * 100)
                    return (
                      <div key={d.day} className="flex-1 rounded-t-md bg-accent" style={{ height: `${pct}%` }} />
                    )
                  })}
                </div>

                {trendWindow === 7 ? (
                  <div className="mt-2 flex gap-1">
                    {trend.data.map((d) => (
                      <p key={d.day} className="flex-1 text-center text-[10px] text-muted">
                        {DAY_LABELS[new Date(d.day).getDay()]}
                      </p>
                    ))}
                  </div>
                ) : (
                  trendStart &&
                  trendEnd && (
                    <p className="mt-2 text-center text-[11px] font-semibold text-muted">
                      {formatDate(trendStart)} – {formatDate(trendEnd)}
                    </p>
                  )
                )}
              </>
            )}
          </div>
        </>
      )}
    </div>
  )
}
