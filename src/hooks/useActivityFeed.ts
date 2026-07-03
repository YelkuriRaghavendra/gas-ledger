import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { ActivityEntry } from '../types/db'

export function useActivityFeed(limit = 50) {
  const [data, setData] = useState<ActivityEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('activity_feed')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit)
    if (error) setError(error.message)
    else setData(data as ActivityEntry[])
    setLoading(false)
  }, [limit])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    supabase
      .from('activity_feed')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit)
      .then(({ data, error }) => {
        if (cancelled) return
        if (error) setError(error.message)
        else setData(data as ActivityEntry[])
        setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [limit])

  return { data, loading, error, refresh }
}
