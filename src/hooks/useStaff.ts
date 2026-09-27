import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { Profile } from '../types/db'

// The full roster, owner-only in the UI. profiles_read is `using (true)`, so
// the read itself is not gated -- see decision 5 in the design: useProfiles()
// depends on every user being able to resolve created_by into a name.
export function useStaff() {
  const [staff, setStaff] = useState<Profile[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // refresh() is called both by the mount effect and manually (e.g. right
  // after saving an edit, to pull the fresh row). Two calls can be in
  // flight at once, and unlike the effect-only case in useProfiles, a
  // request-id check is what makes "the later call wins" hold instead of
  // "the later response wins" -- a fast manual refresh must not be
  // overwritten by a slow one still resolving from mount.
  const requestId = useRef(0)
  const mounted = useRef(true)
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])

  const refresh = useCallback(async () => {
    const id = ++requestId.current
    setLoading(true)
    const { data, error } = await supabase
      .from('profiles')
      .select('id, name, role, segment_access, active, updated_at, updated_by')
      .order('name')
    if (!mounted.current || id !== requestId.current) return
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
