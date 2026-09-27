// Pure decision logic for set_active, split out of index.ts so the ordering
// and idempotency rules can be unit tested without deploying: no imports, no
// network calls, same arrangement validation.ts already uses.

// 100 years. GoTrue takes a duration string, not a flag -- 'none' lifts it.
export const BAN_FOREVER = '876000h'

// Which of the two non-transactional writes goes first. Chosen so that if
// only one write lands, the account ends up on the side that denies access
// rather than the side that grants it:
//   - deactivating: ban (denies) then flag (record-keeping) -- if the flag
//     write then fails, the account is banned but still shown active. Wrong
//     to look at, but nobody unauthorized can act.
//   - activating: flag (record-keeping) then unban (grants) -- if the unban
//     then fails, the account is shown active but still banned. Wrong to
//     look at, but still nobody can act who shouldn't.
// Either partial state is a visible, recoverable availability bug, never a
// security hole.
export type WriteOrder = 'ban_then_flag' | 'flag_then_unban'

export interface SetActivePlan {
  // The ban_duration to send to auth.admin.updateUserById. Always present:
  // this call must never be skipped, even when the flag already matches --
  // see write_flag below for why.
  ban_duration: string
  // Whether the profiles.active write is needed at all. False only when the
  // profile already reads the desired value, in which case the handler must
  // still re-apply ban_duration (idempotent on GoTrue's side) so that a
  // previous call which banned/unbanned but failed to write the flag has a
  // way to be repaired by retrying the same action.
  write_flag: boolean
  // Order to perform the two writes in when write_flag is true. Meaningless
  // when write_flag is false, since only the ban/unban call happens.
  order: WriteOrder
}

// current: the target profile's row as read from the database right now.
// desired: the active state the caller asked for.
export function planSetActive(current: { active: boolean }, desired: boolean): SetActivePlan {
  return {
    ban_duration: desired ? 'none' : BAN_FOREVER,
    write_flag: current.active !== desired,
    order: desired ? 'flag_then_unban' : 'ban_then_flag',
  }
}

// The exact message raised by enforce_profile_admin_rules in
// supabase/migrations/019_staff_management.sql. PostgREST forwards the raised
// exception as the error's message, so a substring match on the phrase is the
// only signal available.
const LAST_OWNER_BACKSTOP = 'at least one active owner is required'

// Whether a failed profiles.active write is the database refusing to remove
// the last active owner -- the one failure that leaves the account banned
// with no in-app way back, and therefore the only one worth compensating.
//
// Deliberately narrow. If the trigger's wording ever changes this stops
// matching, and the caller then leaves the ban in place: the account is
// denied access it should have, which is visible and repairable, rather than
// handed access the owner just tried to take away. Do not broaden this to
// "any error mentioning owners" to make the happy path prettier -- every
// error it newly matches becomes an unban.
export function isLastOwnerBackstop(message: string | null | undefined): boolean {
  return typeof message === 'string' && message.includes(LAST_OWNER_BACKSTOP)
}

// GoTrue reports a ban as an absolute timestamp (`banned_until`) but only
// accepts a relative duration when writing one, so putting a ban back means
// converting the timestamp into the time still left on it.
//
// Seconds, not hours: a short ban set by hand from the dashboard must not be
// rounded up into a long one. Rounded up rather than down so the restored ban
// never lapses earlier than the one it stands in for.
//
// bannedUntil: the target's banned_until as read before the ban was applied.
// now: Date.now() at the moment of the restore.
export function banDurationToRestore(bannedUntil: string | null | undefined, now: number): string {
  if (!bannedUntil) return 'none'
  const until = Date.parse(bannedUntil)
  // An unreadable timestamp is not evidence of a ban, and this is only
  // reached on the last-owner path where the account is meant to stay
  // usable, so treat it as "was not banned".
  if (Number.isNaN(until)) return 'none'
  const secondsLeft = Math.ceil((until - now) / 1000)
  if (secondsLeft <= 0) return 'none'
  return `${secondsLeft}s`
}
