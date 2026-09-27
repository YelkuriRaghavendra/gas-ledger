import type { Profile, Role, SegmentAccess } from '../types/db'

export const ROLES: Role[] = ['owner', 'staff']
export const SEGMENTS: SegmentAccess[] = ['commercial', 'domestic', 'both']

export function roleLabel(role: Role): string {
  return role === 'owner' ? 'Owner' : 'Staff'
}

export function segmentLabel(s: SegmentAccess): string {
  if (s === 'both') return 'Both sides'
  return s === 'commercial' ? 'Commercial' : 'Domestic'
}

// Active first, then by name. The id tiebreak keeps two people with the same
// name in a fixed order across refreshes, so rows do not swap under a thumb.
export function sortStaff<T extends { id: string; name: string; active: boolean }>(rows: T[]): T[] {
  return [...rows].sort((a, b) => {
    if (a.active !== b.active) return a.active ? -1 : 1
    const byName = a.name.localeCompare(b.name, 'en', { sensitivity: 'base' })
    return byName !== 0 ? byName : a.id.localeCompare(b.id)
  })
}

// Role, segment access and the active toggle are locked on your own row: the
// database rejects those changes, and a disabled control explains why better
// than a raised exception.
export function canEditOwnAccess(rowId: string, viewerId: string | undefined): boolean {
  return viewerId !== undefined && rowId !== viewerId
}

// Mirrors the "at least one active owner" rule in enforce_profile_admin_rules,
// so the form can refuse before the round trip. An inactive owner is not cover:
// they cannot sign in to undo the change.
export function wouldOrphanOwners(
  rows: Pick<Profile, 'id' | 'role' | 'active'>[],
  changingId: string,
  next: { role: Role; active: boolean },
): boolean {
  const othersCovering = rows.some((r) => r.id !== changingId && r.role === 'owner' && r.active)
  if (othersCovering) return false
  const wasCovering = rows.some((r) => r.id === changingId && r.role === 'owner' && r.active)
  if (!wasCovering) return false
  return !(next.role === 'owner' && next.active)
}

// The exact sentences enforce_profile_admin_rules (019_staff_management.sql)
// raises. They are already plain English, so they pass straight through
// instead of being flattened into the generic sentence below.
const KNOWN_PROFILE_WRITE_ERRORS = [
  'only an owner can change role, segment access or active status',
  'you cannot change your own role',
  'you cannot deactivate yourself',
  'at least one active owner is required',
  'only an owner can create an owner account',
]

// The direct RLS write on the profile fields (StaffEdit) gets a raw Postgres
// message back, not the { error, detail } body the manage-staff function
// returns. PostgREST wraps the trigger's exception text inside its own
// message (constraint name, hint, and so on), so a known sentence is matched
// as a substring rather than compared for equality. Anything else -- a
// connection blip, a constraint the trigger did not raise -- is not something
// a shop owner can act on, so it gets the same generic sentence the rest of
// this feature uses; the caller is expected to log the original to the
// console instead of showing it.
export function profileWriteErrorMessage(message: string | null | undefined): string {
  const known = message ? KNOWN_PROFILE_WRITE_ERRORS.find((m) => message.includes(m)) : undefined
  return known ?? FALLBACK
}

const FALLBACK = 'Something went wrong. Try again.'

export function staffErrorMessage(body: { error?: string; detail?: string } | null): string {
  if (!body?.error) return FALLBACK
  if (body.detail) return body.detail
  switch (body.error) {
    case 'unauthorized':
      return 'Your session has expired. Sign in again.'
    case 'forbidden':
      return 'Only an owner can do this.'
    case 'invalid_request':
      return 'Check the details and try again.'
    case 'email_taken':
      return 'That email already has a login.'
    case 'not_found':
      return 'That person is no longer on the roster. Pull to refresh.'
    default:
      return FALLBACK
  }
}
