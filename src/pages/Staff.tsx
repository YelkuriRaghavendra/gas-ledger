import { Link } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { useStaff } from '../hooks/useStaff'
import { sortStaff, roleLabel, segmentLabel } from '../utils/staff'
import { ChevronLeftIcon, UserPlusIcon } from '../components/icons'
import { InitialsBadge } from '../components/InitialsBadge'
import type { Profile } from '../types/db'

const pillCls = 'rounded-full px-[9px] py-[3px] text-[10.5px] font-bold uppercase tracking-[0.4px]'

function StaffRow({ person, isYou }: { person: Profile; isYou: boolean }) {
  return (
    <Link
      to={`/account/staff/${person.id}`}
      className="flex items-center gap-3 rounded-[16px] bg-surface px-[14px] py-[13px] shadow-card"
    >
      <InitialsBadge name={person.name} size={40} radius={13} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-[14.5px] font-bold text-ink">
          {person.name}
          {isYou && <span className="ml-[6px] text-[11.5px] font-semibold text-subtle">You</span>}
        </p>
        <div className="mt-[5px] flex flex-wrap items-center gap-[6px]">
          <span className={`${pillCls} ${person.role === 'owner' ? 'bg-[#FBEDE4] text-[#E4571B]' : 'bg-[#F1E9DB] text-muted'}`}>
            {roleLabel(person.role)}
          </span>
          <span className={`${pillCls} bg-[#F1E9DB] text-muted`}>{segmentLabel(person.segment_access)}</span>
          {!person.active && <span className={`${pillCls} bg-[#FBE9E4] text-[#C23B22]`}>Off</span>}
        </div>
      </div>
      <span className="text-[#C0B4A2]">›</span>
    </Link>
  )
}

export function Staff() {
  const { profile } = useAuth()
  const { staff, loading, error } = useStaff()

  const active = sortStaff(staff.filter((p) => p.active))
  const inactive = sortStaff(staff.filter((p) => !p.active))

  return (
    <div className="p-4">
      <Link to="/account" className="mb-3 inline-flex items-center gap-[6px] py-[6px] text-sm font-bold text-muted">
        <ChevronLeftIcon size={18} /> Account
      </Link>
      <h1 className="mb-4 font-display text-[24px] font-bold tracking-[-0.5px] text-ink">Staff</h1>

      {loading && <p className="text-muted">Loading…</p>}
      {/* An error and a genuinely empty roster look identical below, so a
          failed load must not also render the (empty) roster body and the
          add button -- an owner could mistake that for "nobody's on it yet". */}
      {!loading && error && <p className="text-sm text-red-600">{error}</p>}

      {!loading && !error && (
        <>
          {active.length === 0 && inactive.length === 0 && (
            <p className="rounded-[20px] bg-surface px-4 py-10 text-center text-sm font-medium text-subtle shadow-card">
              No staff yet
            </p>
          )}

          <div className="space-y-[10px]">
            {active.map((p) => (
              <StaffRow key={p.id} person={p} isYou={p.id === profile?.id} />
            ))}
          </div>

          {inactive.length > 0 && (
            <>
              <p className="mb-2 mt-6 text-[11px] font-bold uppercase tracking-[0.5px] text-subtle">Turned off</p>
              <div className="space-y-[10px] opacity-70">
                {inactive.map((p) => (
                  <StaffRow key={p.id} person={p} isYou={p.id === profile?.id} />
                ))}
              </div>
            </>
          )}

          <Link
            to="/account/staff/new"
            className="mt-6 flex h-[52px] w-full items-center justify-center gap-2 rounded-[16px] bg-accent text-[15px] font-bold text-white"
          >
            <UserPlusIcon size={18} color="#fff" /> Add staff member
          </Link>
        </>
      )}
    </div>
  )
}
