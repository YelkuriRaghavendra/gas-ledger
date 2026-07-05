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
    <div className="relative flex min-h-screen flex-col justify-center overflow-hidden px-7">
      {/* soft warm glow accents behind the content */}
      <div className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-accent/[.12] blur-3xl" />
      <div className="pointer-events-none absolute -bottom-28 -left-20 h-72 w-72 rounded-full bg-[#2E8B57]/[.10] blur-3xl" />

      <div className="relative w-full max-w-sm">
        <div className="mb-7 flex h-[76px] w-[76px] items-center justify-center rounded-[24px] bg-gradient-to-br from-accentSoft to-accent shadow-glow">
          <CylinderIcon size={38} />
        </div>
        <h1 className="font-display text-[32px] font-bold leading-[1.04] tracking-[-0.6px] text-ink">
          {nameLine1}
          {nameLine2 && (
            <>
              <br />
              {nameLine2}
            </>
          )}
        </h1>
        <p className="mb-9 mt-[10px] text-sm font-medium text-muted">Cylinder distribution ledger</p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <p className="mb-2 text-xs font-bold uppercase tracking-[0.6px] text-muted">Email</p>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="h-[54px] w-full rounded-[16px] border-[1.5px] border-borderMuted bg-surface px-4 font-semibold text-ink shadow-card"
            />
          </div>
          <div>
            <p className="mb-2 text-xs font-bold uppercase tracking-[0.6px] text-muted">Password</p>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="h-[54px] w-full rounded-[16px] border-[1.5px] border-borderMuted bg-surface px-4 font-semibold text-ink shadow-card"
            />
          </div>
          <label className="flex cursor-pointer items-center gap-[10px] py-1 text-sm font-semibold text-muted">
            <input
              type="checkbox"
              checked={remember}
              onChange={(e) => setRemember(e.target.checked)}
              className="h-[18px] w-[18px] accent-accent"
            />
            Remember me
          </label>
          {error && (
            <p className="rounded-xl bg-[#FBE9E4] px-4 py-3 text-sm font-semibold text-[#C23B22]">{error}</p>
          )}
          <button
            type="submit"
            disabled={submitting}
            className="h-[56px] w-full rounded-[16px] bg-gradient-to-br from-accentSoft to-accent text-[15px] font-bold text-white shadow-glow transition active:scale-[0.99] disabled:opacity-50"
          >
            {submitting ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
      </div>
    </div>
  )
}
