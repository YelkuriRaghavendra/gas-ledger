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

export function useActivityFeed(limit = 50, segment: Segment = 'commercial') {
  const [data, setData] = useState<FeedItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('activity_feed')
      .select('*')
      .eq('segment', segment)
      .order('created_at', { ascending: false })
      .limit(limit)
    if (error) setError(error.message)
    else setData((data as ActivityEntry[]).map(normalizeFeedRow))
    setLoading(false)
  }, [limit, segment])

  useEffect(() => { refresh() }, [refresh])
  return { data, loading, error, refresh }
}
