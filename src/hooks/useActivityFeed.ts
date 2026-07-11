import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { ActivityEntry } from '../types/db'

export function useActivityFeed(limit = 50) {
  const [data, setData] = useState<ActivityEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Domestic sales carry no customer — keep them out of the commercial feed.
  const refresh = useCallback(async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('activity_feed')
      .select('*')
      .not('customer_id', 'is', null)
      .order('created_at', { ascending: false })
      .limit(limit)
    if (error) setError(error.message)
    else setData(data as ActivityEntry[])
    setLoading(false)
  }, [limit])

  useEffect(() => {
    refresh()
  }, [refresh])

  return { data, loading, error, refresh }
}
