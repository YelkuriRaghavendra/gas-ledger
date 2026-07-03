import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { AgencySettings } from '../types/db'

export function useAgencySettings() {
  const [data, setData] = useState<AgencySettings | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    setLoading(true)
    const { data, error } = await supabase.from('agency_settings').select('*').eq('id', true).single()
    if (error) setError(error.message)
    else setData(data as AgencySettings)
    setLoading(false)
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh])

  return { data, loading, error, refresh }
}
