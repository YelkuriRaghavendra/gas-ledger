import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

// Maps a user id (created_by / updated_by) to that person's display name,
// so detail screens can show "Created by <name>". Requires the profiles
// "read all profile names" policy; without it this map only holds the
// current user, and callers hide names they can't resolve.
export function useProfiles() {
  const [byId, setById] = useState<Map<string, string>>(new Map())

  useEffect(() => {
    let active = true
    supabase
      .from('profiles')
      .select('id, name')
      .then(({ data }) => {
        if (active && data) setById(new Map(data.map((p) => [p.id, p.name])))
      })
    return () => {
      active = false
    }
  }, [])

  return byId
}
