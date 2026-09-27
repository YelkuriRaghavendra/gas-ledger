import { describe, it, expect } from 'vitest'
import { planSetActive, BAN_FOREVER } from './setActivePlan'

describe('planSetActive', () => {
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
