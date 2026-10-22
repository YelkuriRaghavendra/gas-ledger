import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

const TTL_S = 60 * 60
// Signed URLs are cached so scrolling or reopening a chat does not re-sign every
// file. An entry is dropped a minute before it expires.
const cache = new Map<string, { url: string; expires: number }>()

/** A short-lived URL for a file in the private chat-media bucket. */
export function useMediaUrl(path: string | null) {
  const [url, setUrl] = useState<string | null>(() => (path ? cache.get(path)?.url ?? null : null))
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    if (!path) return
    const hit = cache.get(path)
    if (hit && hit.expires > Date.now()) {
      setUrl(hit.url)
      return
    }
    let cancelled = false
    supabase.storage
      .from('chat-media')
      .createSignedUrl(path, TTL_S)
      .then(({ data, error }) => {
        if (cancelled) return
        if (error || !data) {
          setFailed(true)
          return
        }
        cache.set(path, { url: data.signedUrl, expires: Date.now() + (TTL_S - 60) * 1000 })
        setUrl(data.signedUrl)
      })
    return () => {
      cancelled = true
    }
  }, [path])

  return { url, failed }
}
