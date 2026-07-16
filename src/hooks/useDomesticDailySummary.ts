import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { DailyProductSummary } from '../types/db'

function daysAgoStart(days: number) {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  d.setDate(d.getDate() - days)
  return d.toISOString()
}

// Trailing per-day, per-product sales rollup for the domestic segment.
export function useDomesticDailySummary(days = 30) {
  const [data, setData] = useState<DailyProductSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('daily_product_summary')
      .select('*')
      .eq('segment', 'domestic')
      .gte('day', daysAgoStart(days))
      .order('day', { ascending: false })
    if (error) setError(error.message)
    else setData(data as DailyProductSummary[])
    setLoading(false)
  }, [days])

  useEffect(() => {
    refresh()
  }, [refresh])

  return { data, loading, error, refresh }
}
