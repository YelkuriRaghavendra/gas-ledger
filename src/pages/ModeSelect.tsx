import { Navigate, useNavigate, Link } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { setMode } from '../mode/mode'
import { CylinderIcon } from '../components/CylinderIcon'
import { HomeIcon, TruckIcon, BoxIcon } from '../components/icons'

// Post-login fork for owners (segment_access = 'both'). Single-segment
// staff never see this screen — ModeGate routes them straight in.
export function ModeSelect() {
  const navigate = useNavigate()
  const { profile } = useAuth()

  if (profile && profile.segment_access !== 'both') {
    return <Navigate to={profile.segment_access === 'domestic' ? '/domestic' : '/commercial'} replace />
  }

  function choose(mode: 'commercial' | 'domestic') {
    setMode(mode)
    navigate(mode === 'domestic' ? '/domestic' : '/commercial', { replace: true })
  }

  return (
    <div className="relative flex min-h-screen flex-col justify-center overflow-hidden px-6">
      <div className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-accent/[.12] blur-3xl" />
      <div className="pointer-events-none absolute -bottom-28 -left-20 h-72 w-72 rounded-full bg-[#2E8B57]/[.10] blur-3xl" />

      <div className="relative mx-auto w-full max-w-sm">
        <div className="mb-6 flex h-[64px] w-[64px] items-center justify-center rounded-[20px] bg-gradient-to-br from-accentSoft to-accent shadow-glow">
          <CylinderIcon size={32} />
        </div>
        <h1 className="font-display text-[30px] font-bold leading-[1.06] tracking-[-0.6px] text-ink">
          Which side of the
          <br />
          business today?
        </h1>
        <p className="mb-8 mt-[10px] text-sm font-medium text-muted">Choose where you want to work</p>

        <button
          onClick={() => choose('commercial')}
          className="mb-4 flex w-full items-center gap-4 rounded-[22px] bg-gradient-to-br from-inkSoft to-ink p-5 text-left shadow-float transition active:scale-[0.98]"
        >
          <div className="flex h-[52px] w-[52px] shrink-0 items-center justify-center rounded-[16px] bg-gradient-to-br from-accentSoft to-accent">
            <TruckIcon size={26} color="#fff" strokeWidth={2} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="font-display text-[19px] font-bold text-white">Commercial</p>
            <p className="mt-[2px] text-[12.5px] font-semibold text-mutedOnDark">
              Hotels &amp; businesses · credit · empties ledger
            </p>
          </div>
          <span className="text-[20px] font-bold text-[#8a7d6c]">›</span>
        </button>

        <button
          onClick={() => choose('domestic')}
          className="flex w-full items-center gap-4 rounded-[22px] bg-gradient-to-br from-[#255C42] to-[#183F2D] p-5 text-left shadow-float transition active:scale-[0.98]"
        >
          <div className="flex h-[52px] w-[52px] shrink-0 items-center justify-center rounded-[16px] bg-gradient-to-br from-[#3DA06A] to-[#2E8B57]">
            <HomeIcon size={26} color="#fff" strokeWidth={2} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="font-display text-[19px] font-bold text-white">Domestic</p>
            <p className="mt-[2px] text-[12.5px] font-semibold text-[#9DC7AF]">
              Home refills · counter billing · daily sales
            </p>
          </div>
          <span className="text-[20px] font-bold text-[#5f8a72]">›</span>
        </button>

        <Link
          to="/stock"
          className="mt-4 flex w-full items-center gap-4 rounded-[22px] bg-surface p-5 text-left shadow-card transition active:scale-[0.98]"
        >
          <div className="flex h-[52px] w-[52px] shrink-0 items-center justify-center rounded-[16px] bg-ink">
            <BoxIcon size={26} color="#fff" strokeWidth={2} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="font-display text-[19px] font-bold text-ink">Godown Inventory</p>
            <p className="mt-[2px] text-[12.5px] font-semibold text-muted">
              Commercial &amp; domestic · full &amp; empty
            </p>
          </div>
          <span className="text-[20px] font-bold text-subtle">›</span>
        </Link>
      </div>
    </div>
  )
}
