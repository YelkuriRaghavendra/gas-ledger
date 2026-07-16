import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

export interface BundleComponent {
  id: number
  bundle_product_id: number
  component_product_id: number
  qty: number
}

// Combo definitions: selling a bundle product consumes its
// components' stock (handled by the godown_stock view).
export function useBundleComponents() {
  const [data, setData] = useState<BundleComponent[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    setLoading(true)
    const { data, error } = await supabase.from('bundle_components').select('*')
    if (error) setError(error.message)
    else setData(data as BundleComponent[])
    setLoading(false)
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh])

  return { data, loading, error, refresh }
}
