import { describe, it, expect } from 'vitest'
import { planSetActive, banDurationToRestore, isLastOwnerBackstop, BAN_FOREVER } from './setActivePlan'

describe('planSetActive', () => {
  // Pinned to the literal: every other assertion here compares against the
  // imported constant, so setting BAN_FOREVER to 'none' would keep them all
  // green while every ban quietly became a no-op.
  it('BAN_FOREVER is a duration that actually bans', () => {
    expect(BAN_FOREVER).toBe('876000h')
  })

  it('deactivating an active profile bans and writes the flag, ban before flag', () => {
    const plan = planSetActive({ active: true }, false)
    expect(plan.ban_duration).toBe(BAN_FOREVER)
    expect(plan.write_flag).toBe(true)
    expect(plan.order).toBe('ban_then_flag')
  })

  it('activating an inactive profile unbans and writes the flag, flag before unban', () => {
    const plan = planSetActive({ active: false }, true)
    expect(plan.ban_duration).toBe('none')
    expect(plan.write_flag).toBe(true)
    expect(plan.order).toBe('flag_then_unban')
  })

  it('deactivating an already-inactive profile still re-applies the ban, but skips the flag write', () => {
    const plan = planSetActive({ active: false }, false)
    expect(plan.ban_duration).toBe(BAN_FOREVER)
    expect(plan.write_flag).toBe(false)
  })

  it('activating an already-active profile still re-applies the unban, but skips the flag write', () => {
    const plan = planSetActive({ active: true }, true)
    expect(plan.ban_duration).toBe('none')
    expect(plan.write_flag).toBe(false)
  })

  it('never omits the GoTrue call: ban_duration is set regardless of write_flag', () => {
    for (const current of [{ active: true }, { active: false }]) {
      for (const desired of [true, false]) {
        const plan = planSetActive(current, desired)
        expect(plan.ban_duration).toBe(desired ? 'none' : BAN_FOREVER)
      }
    }
  })

  it('order is always ban_then_flag when deactivating, regardless of current state', () => {
    expect(planSetActive({ active: true }, false).order).toBe('ban_then_flag')
    expect(planSetActive({ active: false }, false).order).toBe('ban_then_flag')
  })

  it('order is always flag_then_unban when activating, regardless of current state', () => {
    expect(planSetActive({ active: false }, true).order).toBe('flag_then_unban')
    expect(planSetActive({ active: true }, true).order).toBe('flag_then_unban')
  })
})

describe('isLastOwnerBackstop', () => {
  it('matches the message the database trigger raises', () => {
    expect(isLastOwnerBackstop('at least one active owner is required')).toBe(true)
  })

  it('matches when PostgREST wraps the raised message in its own text', () => {
    expect(
      isLastOwnerBackstop('at least one active owner is required (SQLSTATE P0001)'),
    ).toBe(true)
  })

  it('does not match unrelated write failures, which must stay banned', () => {
    expect(isLastOwnerBackstop('permission denied for table profiles')).toBe(false)
    expect(isLastOwnerBackstop('TypeError: fetch failed')).toBe(false)
    expect(isLastOwnerBackstop('duplicate key value violates unique constraint')).toBe(false)
  })

  it('does not match a merely owner-flavoured message', () => {
    expect(isLastOwnerBackstop('owner role cannot be changed')).toBe(false)
    // Reworded backstop: falls through to "leave the ban", which is the safe
    // side. The narrow match is the point, not an oversight.
    expect(isLastOwnerBackstop('one active owner must remain')).toBe(false)
  })

  it('handles a missing message without throwing', () => {
    expect(isLastOwnerBackstop(undefined)).toBe(false)
    expect(isLastOwnerBackstop(null)).toBe(false)
    expect(isLastOwnerBackstop('')).toBe(false)
  })
})

describe('banDurationToRestore', () => {
  const now = Date.parse('2026-09-27T12:00:00.000Z')

  it('restores "not banned" when there was no ban', () => {
    expect(banDurationToRestore(null, now)).toBe('none')
    expect(banDurationToRestore(undefined, now)).toBe('none')
  })

  it('restores "not banned" when the previous ban had already lapsed', () => {
    expect(banDurationToRestore('2026-09-27T11:59:59.000Z', now)).toBe('none')
    expect(banDurationToRestore('2020-01-01T00:00:00.000Z', now)).toBe('none')
  })

  it('puts back the time left on a ban that was still running', () => {
    expect(banDurationToRestore('2026-09-27T13:00:00.000Z', now)).toBe('3600s')
    expect(banDurationToRestore('2026-09-27T12:00:30.000Z', now)).toBe('30s')
  })

  it('rounds up, so a restored ban never lapses earlier than the original', () => {
    expect(banDurationToRestore('2026-09-27T12:00:30.500Z', now)).toBe('31s')
  })

  it('keeps a forever-ban effectively forever', () => {
    const forever = banDurationToRestore('2126-09-27T12:00:00.000Z', now)
    const hoursLeft = Number(forever.replace('s', '')) / 3600
    expect(hoursLeft).toBeGreaterThan(875000)
  })

  it('treats an unreadable timestamp as "not banned" rather than guessing', () => {
    expect(banDurationToRestore('not a date', now)).toBe('none')
  })
})
