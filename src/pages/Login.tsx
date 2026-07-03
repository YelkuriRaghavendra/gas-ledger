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

  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-6">
      <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-accent">
        <CylinderIcon size={38} />
      </div>
      <h1 className="mb-1 text-2xl font-bold text-ink">{settings?.business_name || 'Cylinder Tracker'}</h1>
      <p className="mb-8 text-sm text-muted">Cylinder distribution ledger</p>
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
          className="w-full rounded-lg bg-accent py-3 font-semibold text-white disabled:opacity-50"
        >
          {submitting ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </div>
  )
}
