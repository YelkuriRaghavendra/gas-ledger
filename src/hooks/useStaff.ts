import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { Profile } from '../types/db'

// The full roster, owner-only in the UI. profiles_read is `using (true)`, so
// the read itself is not gated -- see decision 5 in the design: useProfiles()
// depends on every user being able to resolve created_by into a name.
export function useStaff() {
  const [staff, setStaff] = useState<Profile[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('profiles')
      .select('id, name, role, segment_access, active, updated_at, updated_by')
      .order('name')
    if (error) setError(error.message)
    else {
      setError(null)
      setStaff((data ?? []) as Profile[])
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh])

  return { staff, loading, error, refresh }
}
