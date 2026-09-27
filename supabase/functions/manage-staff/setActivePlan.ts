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
