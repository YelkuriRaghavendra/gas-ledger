import { useOnlineStatus } from '../hooks/useOnlineStatus'

export function ConnectionBanner() {
  const online = useOnlineStatus()
  if (online) return null
  return (
    <div className="bg-red-600 py-1 text-center text-sm text-white">
      No connection — reconnect to continue
    </div>
  )
}
