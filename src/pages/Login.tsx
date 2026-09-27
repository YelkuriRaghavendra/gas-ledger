import { FormEvent, useEffect, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { useAgencySettings } from '../hooks/useAgencySettings'
import { REMEMBER_ME_STORAGE_KEY } from '../lib/supabase'
import { CylinderIcon } from '../components/CylinderIcon'
import { takeSignOutReason, signOutMessage } from '../auth/signOutReason'

export function Login() {
  const { session, signIn } = useAuth()
  const { data: settings, loading: settingsLoading } = useAgencySettings()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [passwordVisible, setPasswordVisible] = useState(false)
  const [remember, setRemember] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)

  // Read-and-clear as an effect, not a lazy initializer: StrictMode
  // double-invokes initializers in development, so the first, discarded
  // pass would clear sessionStorage and the committed pass would read null.
  // Runs before the early `if (session)` return below so hooks still fire
  // on every render.
  useEffect(() => {
    const reason = takeSignOutReason()
    if (reason) setNotice(signOutMessage(reason))
  }, [])

  if (session) return <Navigate to="/" replace />

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    setError(null)
    localStorage.setItem(REMEMBER_ME_STORAGE_KEY, String(remember))
    const { error } = await signIn(email, password)
    setSubmitting(false)
    if (error) {
      setError(/banned|blocked/i.test(error) ? signOutMessage('inactive') : error)
    }
  }

  // The login page represents the agency, so wait for the configured name
  // rather than replacing it with a generic product or placeholder name.
  const agencyName = settings?.business_name?.trim()

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-cream px-5 py-7 sm:px-7">
      <div className="pointer-events-none absolute -right-36 -top-28 h-[360px] w-[360px] rounded-full bg-accent/[.12] blur-3xl" />
      <div className="pointer-events-none absolute -bottom-36 -left-32 h-[340px] w-[340px] rounded-full bg-[#91B89C]/[.22] blur-3xl" />

      <div className="relative w-full max-w-[410px]">
        <section className="relative overflow-hidden rounded-[32px] bg-gradient-to-br from-inkSoft to-ink px-6 pb-14 pt-6 text-white shadow-float">
          <div className="pointer-events-none absolute -bottom-12 -right-7 opacity-30">
            <svg width="202" height="202" viewBox="0 0 24 24" fill="#E4571B" aria-hidden="true">
              <rect x="6" y="6" width="12" height="16.5" rx="5" />
              <rect x="8.6" y="3.6" width="6.8" height="2.6" rx="1.3" />
            </svg>
          </div>

          <div className="relative flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-[16px] bg-gradient-to-br from-accentSoft to-accent shadow-glow">
              <CylinderIcon size={25} />
            </div>
            <span className="text-[11px] font-bold uppercase tracking-[1.5px] text-[#C9BBA8]">Operations hub</span>
          </div>

          <div className="relative mt-8">
            <p className="text-[13px] font-semibold text-mutedOnDark">Welcome to</p>
            <h1 className="mt-1 break-words font-display text-[34px] font-bold leading-[1.02] tracking-[-0.8px]">
              {agencyName ?? (settingsLoading ? 'Loading…' : 'Agency name unavailable')}
            </h1>
            <p className="mt-3 max-w-[220px] text-[13px] font-medium leading-relaxed text-[#C9BBA8]">
              Keep every cylinder, payment, and delivery in sync.
            </p>
          </div>
        </section>

        <section className="relative -mt-7 rounded-[28px] bg-surface p-5 shadow-float">
          <div className="mb-6">
            <h2 className="font-display text-[22px] font-bold tracking-[-0.35px] text-ink">Sign in</h2>
            <p className="mt-1 text-[13px] font-medium text-muted">Use your agency account to continue.</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <label className="block">
              <span className="mb-2 block text-[10px] font-extrabold uppercase tracking-[0.9px] text-muted">Email address</span>
              <input
                type="email"
                required
                autoComplete="email"
                placeholder="name@agency.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="h-[54px] w-full rounded-[15px] border-[1.5px] border-borderMuted bg-[#FCFBF9] px-4 text-[14px] font-semibold text-ink placeholder:text-subtle"
              />
            </label>
            <label className="block">
              <span className="mb-2 block text-[10px] font-extrabold uppercase tracking-[0.9px] text-muted">Password</span>
              <div className="relative">
                <input
                  type={passwordVisible ? 'text' : 'password'}
                  required
                  autoComplete="current-password"
                  placeholder="Enter your password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="h-[54px] w-full rounded-[15px] border-[1.5px] border-borderMuted bg-[#FCFBF9] px-4 pr-12 text-[14px] font-semibold text-ink placeholder:text-subtle"
                />
                <button
                  type="button"
                  onClick={() => setPasswordVisible((visible) => !visible)}
                  aria-label={passwordVisible ? 'Hide password' : 'Show password'}
                  aria-pressed={passwordVisible}
                  className="absolute inset-y-0 right-0 grid w-12 place-items-center text-subtle transition hover:text-accent focus:outline-none"
                >
                  {passwordVisible ? <EyeOffIcon /> : <EyeIcon />}
                </button>
              </div>
            </label>
            <label className="flex cursor-pointer items-center gap-[10px] pt-1 text-[13px] font-semibold text-muted">
              <input
                type="checkbox"
                checked={remember}
                onChange={(e) => setRemember(e.target.checked)}
                className="h-[18px] w-[18px] rounded-[5px] accent-accent"
              />
              Keep me signed in on this device
            </label>
            {(error || notice) && (
              <p role="alert" className="rounded-[14px] bg-[#FBE9E4] px-4 py-3 text-[13px] font-semibold leading-snug text-[#B93820]">
                {error ?? notice}
              </p>
            )}
            <button
              type="submit"
              disabled={submitting}
              className="h-[56px] w-full rounded-[16px] bg-gradient-to-br from-accentSoft to-accent text-[15px] font-bold text-white shadow-glow transition active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {submitting ? 'Signing in…' : 'Sign in to dashboard'}
            </button>
          </form>
        </section>

        <p className="mt-5 text-center text-[11px] font-semibold text-muted">Cylinder distribution ledger</p>
      </div>
    </main>
  )
}

function EyeIcon() {
  return (
    <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2.5 12s3.4-6 9.5-6 9.5 6 9.5 6-3.4 6-9.5 6-9.5-6-9.5-6Z" />
      <circle cx="12" cy="12" r="2.5" />
    </svg>
  )
}

function EyeOffIcon() {
  return (
    <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 3 21 21" />
      <path d="M10.6 6.2A10.6 10.6 0 0 1 12 6c6.1 0 9.5 6 9.5 6a17.6 17.6 0 0 1-3.1 3.8M6.3 6.4A17.8 17.8 0 0 0 2.5 12s3.4 6 9.5 6a9.9 9.9 0 0 0 2.6-.3" />
      <path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" />
    </svg>
  )
}
