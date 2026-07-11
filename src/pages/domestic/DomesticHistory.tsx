import { useDomesticDailySummary } from '../../hooks/useDomesticDailySummary'
import { formatCurrency, formatRelativeDate } from '../../utils/format'
import type { DailyProductSummary } from '../../types/db'

interface DayGroup {
  day: string
  revenue: number
  rows: DailyProductSummary[]
}

function groupByDay(rows: DailyProductSummary[]): DayGroup[] {
  const byDay = new Map<string, DailyProductSummary[]>()
  for (const r of rows) {
    const list = byDay.get(r.day)
    if (list) list.push(r)
    else byDay.set(r.day, [r])
  }
  return Array.from(byDay.entries()).map(([day, rows]) => ({
    day,
    revenue: rows.reduce((sum, r) => sum + r.revenue, 0),
    rows: rows.filter((r) => r.cylinders_sold > 0),
  }))
}

export function DomesticHistory() {
  const { data, loading, error } = useDomesticDailySummary(30)
  const groups = groupByDay(data)

  if (loading) return <p className="p-4 text-muted">Loading…</p>

  return (
    <div className="p-5 pb-[110px] pt-3">
      <h1 className="mb-1 font-display text-[26px] font-bold tracking-[-0.5px] text-ink">History</h1>
      <p className="mb-5 text-[13px] font-medium text-subtle">Day-by-day sales, last 30 days</p>

      {error && <p className="mb-4 text-red-600">{error}</p>}

      <ul className="flex flex-col gap-[11px]">
        {groups.map((g) => (
          <li key={g.day} className="rounded-[18px] bg-surface p-[15px] shadow-card">
            <div className="flex items-baseline justify-between gap-2">
              <p className="text-[12px] font-bold uppercase tracking-[0.4px] text-muted">{formatRelativeDate(g.day)}</p>
              <p className="font-display text-[16px] font-bold text-[#2E8B57]">{formatCurrency(g.revenue)}</p>
            </div>
            <ul className="mt-[10px] flex flex-col gap-[6px]">
              {g.rows.map((r) => (
                <li key={`${g.day}-${r.product_id}`} className="flex items-baseline justify-between gap-2">
                  <p className="text-[13.5px] font-bold text-ink">
                    {r.cylinders_sold} × {r.product_name}
                  </p>
                  <p className="text-[12.5px] font-semibold text-subtle">{formatCurrency(r.revenue)}</p>
                </li>
              ))}
              {g.rows.length === 0 && <li className="text-[12.5px] font-semibold text-subtle">Returns only</li>}
            </ul>
          </li>
        ))}
      </ul>
      {groups.length === 0 && (
        <p className="rounded-[18px] bg-surface px-4 py-8 text-center text-sm font-medium text-subtle shadow-card">
          No sales in the last 30 days
        </p>
      )}
    </div>
  )
}
