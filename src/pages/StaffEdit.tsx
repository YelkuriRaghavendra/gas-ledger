import { FormEvent, useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { useStaff } from '../hooks/useStaff'
import { useProfiles } from '../hooks/useProfiles'
import { supabase } from '../lib/supabase'
import { createStaff, setStaffActive } from '../lib/staffAdmin'
import {
  ROLES,
  SEGMENTS,
  canEditOwnAccess,
  profileWriteErrorMessage,
  roleLabel,
  segmentLabel,
  staffErrorMessage,
  wouldOrphanOwners,
} from '../utils/staff'
import { formatDate } from '../utils/format'
import { ChevronLeftIcon } from '../components/icons'
import type { Role, SegmentAccess } from '../types/db'

const fieldLabel = 'mb-[7px] text-[11px] font-bold uppercase tracking-[0.5px] text-muted'
const fieldInput = 'h-[50px] w-full rounded-[14px] border border-borderMuted bg-cream px-[14px] font-semibold text-ink'
const cardCls = 'space-y-4 rounded-[20px] bg-surface p-5 shadow-card'

function Choice<T extends string>({
  options,
  value,
  onChange,
  label,
  disabled,
}: {
  options: readonly T[]
  value: T
  onChange: (v: T) => void
  label: (v: T) => string
  disabled: boolean
}) {
  return (
    <div className="flex gap-2">
      {options.map((option) => (
        <button
          key={option}
          type="button"
          disabled={disabled}
          onClick={() => onChange(option)}
          className={`h-[44px] flex-1 rounded-[13px] border-[1.5px] text-[13.5px] font-bold transition disabled:opacity-50 ${
            value === option
              ? 'border-accent bg-[#FBEDE4] text-[#E4571B]'
              : 'border-borderMuted bg-cream text-muted'
          }`}
        >
          {label(option)}
        </button>
      ))}
    </div>
  )
}

export function StaffEdit() {
  const { id } = useParams()
  const isNew = id === undefined
  const navigate = useNavigate()
  const { profile } = useAuth()
  const { staff, loading, refresh } = useStaff()
  const profileNames = useProfiles()

  const person = isNew ? undefined : staff.find((p) => p.id === id)

  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [role, setRole] = useState<Role>('staff')
  const [segment, setSegment] = useState<SegmentAccess>('both')
  const [active, setActive] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!person) return
    setName(person.name)
    setRole(person.role)
    setSegment(person.segment_access)
    setActive(person.active)
  }, [person])

  // Role, segment access and the active toggle are rejected by the database on
  // your own row. Disabling them with the reason shown beats surfacing a raised
  // exception after the round trip.
  const accessEditable = isNew || canEditOwnAccess(id!, profile?.id)
  const orphans = !isNew && wouldOrphanOwners(staff, id!, { role, active })

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)

    if (!isNew && orphans) {
      setError('At least one active owner is required.')
      return
    }

    setSaving(true)

    if (isNew) {
      const result = await createStaff({ name, email, password, role, segment_access: segment })
      setSaving(false)
      if (!result.ok) {
        setError(staffErrorMessage(result.error))
        return
      }
      await refresh()
      navigate('/account/staff')
      return
    }

    // Name, role and segment access go straight through RLS -- the owner
    // update policy covers them. Only the active flag needs the service-role
    // key, because it also bans the auth user.
    const fieldsChanged =
      name !== person?.name || role !== person?.role || segment !== person?.segment_access
    if (fieldsChanged) {
      // Without .select(), postgrest-js sends Prefer: return=minimal, and an
      // UPDATE that matches zero rows under RLS still comes back with
      // error === null. That is reachable here: profiles_update_owner checks
      // the caller's live is_active_owner() state, so a second owner
      // demoting or deactivating this caller from another device mid-edit
      // makes the next save match nothing. Asking for the row back and
      // treating "none came back" as a failure is the only way to catch it.
      const { data: updatedRow, error: updateError } = await supabase
        .from('profiles')
        .update({ name: name.trim(), role, segment_access: segment })
        .eq('id', id!)
        .select()
        .maybeSingle()
      if (updateError) {
        setSaving(false)
        console.error(updateError.message)
        setError(profileWriteErrorMessage(updateError.message))
        return
      }
      if (!updatedRow) {
        setSaving(false)
        setError(
          'That did not save. Your own access may have changed -- sign out and back in, then try again.',
        )
        return
      }
    }

    if (active !== person?.active) {
      const result = await setStaffActive(id!, active)
      if (!result.ok) {
        // The RLS write above already landed, so the roster and this
        // screen's "Last changed" footer must catch up before the error
        // shows -- otherwise they sit one save behind until the owner
        // navigates away and back. The retry stays idempotent: the fields
        // above are unchanged, so resubmitting just re-issues this toggle.
        setSaving(false)
        await refresh()
        setError(staffErrorMessage(result.error))
        return
      }
    }

    setSaving(false)
    await refresh()
    navigate('/account/staff')
  }

  if (!isNew && loading) return <p className="p-4 text-muted">Loading…</p>
  if (!isNew && !person) return <p className="p-4 text-muted">That person is no longer on the roster.</p>

  const changedBy = person?.updated_by ? profileNames.get(person.updated_by) : undefined

  return (
    <div className="p-4">
      <Link to="/account/staff" className="mb-3 inline-flex items-center gap-[6px] py-[6px] text-sm font-bold text-muted">
        <ChevronLeftIcon size={18} /> Staff
      </Link>
      <h1 className="mb-4 font-display text-[24px] font-bold tracking-[-0.5px] text-ink">
        {isNew ? 'Add staff member' : person!.name}
      </h1>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className={cardCls}>
          <div>
            <p className={fieldLabel}>Name</p>
            <input value={name} onChange={(e) => setName(e.target.value)} className={fieldInput} />
          </div>
          {isNew && (
            <>
              <div>
                <p className={fieldLabel}>Email</p>
                <input
                  type="email"
                  autoCapitalize="none"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className={fieldInput}
                />
              </div>
              <div>
                <p className={fieldLabel}>Password</p>
                <input
                  type="text"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className={fieldInput}
                />
                <p className="mt-[6px] text-[11.5px] font-semibold text-subtle">
                  At least 8 characters. Hand it over in person — it cannot be changed from the app yet.
                </p>
              </div>
            </>
          )}
        </div>

        <div>
          <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.5px] text-subtle">Access</p>
          <div className={cardCls}>
            <div>
              <p className={fieldLabel}>Role</p>
              <Choice options={ROLES} value={role} onChange={setRole} label={roleLabel} disabled={!accessEditable} />
            </div>
            <div>
              <p className={fieldLabel}>Can use</p>
              <Choice
                options={SEGMENTS}
                value={segment}
                onChange={setSegment}
                label={segmentLabel}
                disabled={!accessEditable}
              />
            </div>
            {!isNew && (
              <label className="flex items-center justify-between py-1">
                <span className="text-[14px] font-bold text-ink">Can sign in</span>
                <input
                  type="checkbox"
                  checked={active}
                  disabled={!accessEditable}
                  onChange={(e) => setActive(e.target.checked)}
                  className="h-[22px] w-[22px] accent-accent disabled:opacity-50"
                />
              </label>
            )}
            {!accessEditable && (
              <p className="text-[11.5px] font-semibold text-subtle">
                You cannot change your own role or turn off your own access. Ask the other owner.
              </p>
            )}
            {orphans && (
              <p className="text-[11.5px] font-semibold text-[#C23B22]">
                At least one active owner is required.
              </p>
            )}
          </div>
        </div>

        {!isNew && person!.updated_at && (
          <p className="text-[11.5px] font-semibold text-subtle">
            Last changed {formatDate(person!.updated_at)}
            {changedBy ? ` by ${changedBy}` : ''}
          </p>
        )}

        {error && <p className="text-sm text-red-600">{error}</p>}

        <button
          type="submit"
          disabled={saving || orphans}
          className="w-full rounded-lg bg-accent py-3 font-semibold text-white disabled:opacity-50"
        >
          {saving ? 'Saving…' : isNew ? 'Create login' : 'Save'}
        </button>
      </form>
    </div>
  )
}
