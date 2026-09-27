// Pure input validation for the manage-staff function. No imports and no
// network calls, so vitest can run this Deno-targeted file unchanged --
// the arrangement templates.ts and statuses.ts already use.

export type Role = 'owner' | 'staff'
export type SegmentAccess = 'commercial' | 'domestic' | 'both'

export interface CreateInput {
  name: string
  email: string
  password: string
  role: Role
  segment_access: SegmentAccess
}

export type Validated<T> = { ok: true; value: T } | { ok: false; detail: string }

const NAME_MAX = 60
const PASSWORD_MIN = 8
const ROLES: Role[] = ['owner', 'staff']
const SEGMENTS: SegmentAccess[] = ['commercial', 'domestic', 'both']

// Deliberately loose: GoTrue is the real authority on what it will accept.
// This only catches the shapes that are obviously not an address, so the owner
// gets a sentence instead of a 422 from the auth API.
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function normalizeEmail(raw: string): string {
  return raw.trim().toLowerCase()
}

function asRecord(body: unknown): Record<string, unknown> | null {
  return typeof body === 'object' && body !== null ? (body as Record<string, unknown>) : null
}

const fail = (detail: string): Validated<never> => ({ ok: false, detail })

export function validateCreate(body: unknown): Validated<CreateInput> {
  const b = asRecord(body)
  if (!b) return fail('Malformed request')

  const name = typeof b.name === 'string' ? b.name.trim() : ''
  if (!name) return fail('Enter a name')
  if (name.length > NAME_MAX) return fail('Name is too long')

  const email = typeof b.email === 'string' ? normalizeEmail(b.email) : ''
  if (!EMAIL.test(email)) return fail('Enter a valid email address')

  // Not trimmed: a leading or trailing space is a legitimate part of a
  // password, and silently stripping it locks the user out of their own login.
  const password = typeof b.password === 'string' ? b.password : ''
  if (password.length < PASSWORD_MIN) return fail(`Password must be at least ${PASSWORD_MIN} characters`)

  const role = b.role as Role
  if (!ROLES.includes(role)) return fail('Pick a role')

  const segment_access = b.segment_access as SegmentAccess
  if (!SEGMENTS.includes(segment_access)) return fail('Pick a segment')

  return { ok: true, value: { name, email, password, role, segment_access } }
}

export function validateSetActive(body: unknown): Validated<{ user_id: string; active: boolean }> {
  const b = asRecord(body)
  if (!b) return fail('Malformed request')

  const user_id = typeof b.user_id === 'string' ? b.user_id : ''
  if (!UUID.test(user_id)) return fail('Unknown user')

  if (typeof b.active !== 'boolean') return fail('Active must be true or false')

  return { ok: true, value: { user_id, active: b.active } }
}
