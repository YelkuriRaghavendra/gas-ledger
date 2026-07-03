import { FormEvent, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { useAgencySettings } from '../hooks/useAgencySettings'
import { REMEMBER_ME_STORAGE_KEY } from '../lib/supabase'
import { CylinderIcon } from '../components/CylinderIcon'

export function Login() {
  const { session, signIn } = useAuth()
  const { data: settings } = useAgencySettings()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [remember, setRemember] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  if (session) return <Navigate to="/" replace />

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    setError(null)
    localStorage.setItem(REMEMBER_ME_STORAGE_KEY, String(remember))
    const { error } = await signIn(email, password)
    setSubmitting(false)
    if (error) setError(error)
  }

  const businessName = settings?.business_name || 'Cylinder Tracker'
  const nameWords = businessName.trim().split(/\s+/)
  const nameLine1 = nameWords.length > 1 ? nameWords.slice(0, -1).join(' ') : nameWords[0]
  const nameLine2 = nameWords.length > 1 ? nameWords[nameWords.length - 1] : null

  return (
    <div className="flex min-h-screen flex-col items-start justify-center px-7">
      <div className="mb-[26px] flex h-[74px] w-[74px] items-center justify-center rounded-[22px] bg-accent shadow-[0_14px_30px_-8px_rgba(228,87,27,0.6)]">
        <CylinderIcon size={38} />
      </div>
      <h1 className="font-display text-[30px] font-bold leading-[1.05] tracking-[-0.5px] text-ink">
        {nameLine1}
        {nameLine2 && (
          <>
            <br />
            {nameLine2}
          </>
        )}
      </h1>
      <p className="mb-8 mt-[10px] text-sm font-medium text-muted">Cylinder distribution ledger</p>
      <form onSubmit={handleSubmit} className="w-full max-w-sm space-y-4">
        <div>
          <p className="mb-2 text-xs font-bold uppercase tracking-wide text-muted">Email</p>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="h-[52px] w-full rounded-[14px] border-[1.5px] border-[#E6DCCB] bg-white px-4 font-semibold text-ink"
          />
        </div>
        <div>
          <p className="mb-2 text-xs font-bold uppercase tracking-wide text-muted">Password</p>
          <input
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="h-[52px] w-full rounded-[14px] border-[1.5px] border-[#E6DCCB] bg-white px-4 font-semibold text-ink"
          />
        </div>
        <label className="flex items-center gap-2 text-sm text-ink/70">
          <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
          Remember me
        </label>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button
          type="submit"
          disabled={submitting}
          className="h-[54px] w-full rounded-[14px] bg-accent font-bold text-white shadow-[0_12px_26px_-10px_rgba(228,87,27,0.7)] disabled:opacity-50"
        >
          {submitting ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </div>
  )
}
