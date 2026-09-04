import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { ActivityEntry, Segment } from '../types/db'

export interface FeedItem extends ActivityEntry {
  title: string
}

export function normalizeFeedRow(row: ActivityEntry): FeedItem {
  const title = row.type === 'purchase' ? `Purchase · ${row.customer_name}` : row.customer_name
  return { ...row, title }
}

// `from`/`to` are optional ISO bounds (half-open: from <= created_at < to) used
// to scope the feed to a period such as one month. They are passed as separate
// strings rather than a range object so the refresh callback keeps a stable
// identity across renders.
export function useActivityFeed(
  limit = 50,
  segment: Segment = 'commercial',
  from?: string,
  to?: string,
) {
  const [data, setData] = useState<FeedItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    setLoading(true)
    let query = supabase.from('activity_feed').select('*').eq('segment', segment)
    if (from) query = query.gte('created_at', from)
    if (to) query = query.lt('created_at', to)
    const { data, error } = await query.order('created_at', { ascending: false }).limit(limit)
    if (error) setError(error.message)
    else {
      setError(null)
      setData((data as ActivityEntry[]).map(normalizeFeedRow))
    }
    setLoading(false)
  }, [limit, segment, from, to])

  useEffect(() => { refresh() }, [refresh])
  return { data, loading, error, refresh }
}
