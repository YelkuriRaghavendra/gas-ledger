import { supabase } from './supabase'
import type { Role, SegmentAccess } from '../types/db'

export interface StaffFnError {
  error: string
  detail?: string
}

export type StaffResult<T> = { ok: true; value: T } | { ok: false; error: StaffFnError }

// supabase-js does not throw on a non-2xx from a function; it returns a
// FunctionsHttpError whose .context is the raw Response. The function's own
// { error, detail } body is in there, and it is the only place the reason for
// a 403 survives -- error.message is just "Edge Function returned a non-2xx
// status code".
async function call<T>(body: Record<string, unknown>): Promise<StaffResult<T>> {
  const { data, error } = await supabase.functions.invoke('manage-staff', { body })

  if (error) {
    const context = (error as { context?: Response }).context
    if (context && typeof context.json === 'function') {
      try {
        return { ok: false, error: (await context.json()) as StaffFnError }
      } catch {
        // Body was not JSON (a gateway error page). Fall through.
      }
    }
    return { ok: false, error: { error: 'server_error' } }
  }

  return { ok: true, value: data as T }
}

export function createStaff(input: {
  name: string
  email: string
  password: string
  role: Role
  segment_access: SegmentAccess
}): Promise<StaffResult<{ user_id: string }>> {
  return call<{ user_id: string }>({ action: 'create', ...input })
}

export function setStaffActive(userId: string, active: boolean): Promise<StaffResult<Record<string, never>>> {
  return call<Record<string, never>>({ action: 'set_active', user_id: userId, active })
}
