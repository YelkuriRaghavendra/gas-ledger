import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { DailyProductSummary } from '../types/db'

export interface TrendDay {
  day: string
  revenue: number
}

function windowStart(days: 7 | 30) {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  d.setDate(d.getDate() - (days - 1))
  return d.toISOString()
}

/**
 * Trailing `days`-day revenue trend, combined across products. Queries
 * daily_product_summary (already grouped by day+product in Postgres) and
 * sums across products per day client-side, the same reduce-over-rows style
 * used elsewhere in this app (see Home.tsx).
 */
export function useRevenueTrend(days: 7 | 30) {
  const [data, setData] = useState<TrendDay[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    setLoading(true)
    const start = windowStart(days)
    const { data, error } = await supabase
      .from('daily_product_summary')
      .select('*')
      .gte('day', start)
      .order('day', { ascending: true })

    if (error) {
      setError(error.message)
    } else {
      const rows = data as DailyProductSummary[]
      const byDay = new Map<string, number>()
      for (const row of rows) {
        byDay.set(row.day, (byDay.get(row.day) ?? 0) + row.revenue)
      }
      setData(Array.from(byDay.entries()).map(([day, revenue]) => ({ day, revenue })))
    }
    setLoading(false)
  }, [days])

  useEffect(() => {
    refresh()
  }, [refresh])

  return { data, loading, error, refresh }
}
