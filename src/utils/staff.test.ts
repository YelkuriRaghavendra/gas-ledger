import { describe, it, expect } from 'vitest'
import {
  roleLabel,
  segmentLabel,
  sortStaff,
  canEditOwnAccess,
  wouldOrphanOwners,
  staffErrorMessage,
  profileWriteErrorMessage,
} from './staff'

describe('roleLabel', () => {
  it('capitalises the stored value', () => {
    expect(roleLabel('owner')).toBe('Owner')
    expect(roleLabel('staff')).toBe('Staff')
  })
})

describe('segmentLabel', () => {
  it('names each segment the way the header does', () => {
    expect(segmentLabel('commercial')).toBe('Commercial')
    expect(segmentLabel('domestic')).toBe('Domestic')
    expect(segmentLabel('both')).toBe('Both sides')
  })
})

describe('sortStaff', () => {
  const row = (id: string, name: string, active: boolean) => ({ id, name, active })

  it('puts active members before inactive ones', () => {
    const out = sortStaff([row('a', 'Zara', false), row('b', 'Amit', true)])
    expect(out.map((r) => r.id)).toEqual(['b', 'a'])
  })

  it('sorts by name within each group', () => {
    const out = sortStaff([
      row('a', 'Ramesh', true),
      row('b', 'Amit', true),
      row('c', 'Zara', false),
      row('d', 'Bala', false),
    ])
    expect(out.map((r) => r.name)).toEqual(['Amit', 'Ramesh', 'Bala', 'Zara'])
  })

  it('ignores case when comparing names', () => {
    const out = sortStaff([row('a', 'bala', true), row('b', 'Amit', true)])
    expect(out.map((r) => r.name)).toEqual(['Amit', 'bala'])
  })

  it('falls back to id so equal names keep a stable order', () => {
    const out = sortStaff([row('b', 'Amit', true), row('a', 'Amit', true)])
    expect(out.map((r) => r.id)).toEqual(['a', 'b'])
  })

  it('does not mutate the input', () => {
    const input = [row('a', 'Zara', false), row('b', 'Amit', true)]
    sortStaff(input)
    expect(input.map((r) => r.id)).toEqual(['a', 'b'])
  })
})

describe('canEditOwnAccess', () => {
  it('is false for your own row', () => {
    expect(canEditOwnAccess('u1', 'u1')).toBe(false)
  })

  it('is true for somebody else', () => {
    expect(canEditOwnAccess('u2', 'u1')).toBe(true)
  })

  it('is false when the viewer is unknown', () => {
    expect(canEditOwnAccess('u2', undefined)).toBe(false)
  })
})

describe('wouldOrphanOwners', () => {
  const rows = [
    { id: 'o1', role: 'owner' as const, active: true },
    { id: 'o2', role: 'owner' as const, active: false },
    { id: 's1', role: 'staff' as const, active: true },
  ]

  it('blocks demoting the only active owner', () => {
    expect(wouldOrphanOwners(rows, 'o1', { role: 'staff', active: true })).toBe(true)
  })

  it('blocks deactivating the only active owner', () => {
    expect(wouldOrphanOwners(rows, 'o1', { role: 'owner', active: false })).toBe(true)
  })

  it('does not count an inactive owner as cover', () => {
    const twoOwnersOneInactive = [
      { id: 'o1', role: 'owner' as const, active: true },
      { id: 'o2', role: 'owner' as const, active: false },
    ]
    expect(wouldOrphanOwners(twoOwnersOneInactive, 'o1', { role: 'staff', active: true })).toBe(true)
  })

  it('allows demoting one of two active owners', () => {
    const twoActive = [
      { id: 'o1', role: 'owner' as const, active: true },
      { id: 'o2', role: 'owner' as const, active: true },
    ]
    expect(wouldOrphanOwners(twoActive, 'o1', { role: 'staff', active: true })).toBe(false)
  })

  it('allows a change that leaves the only owner an owner', () => {
    expect(wouldOrphanOwners(rows, 'o1', { role: 'owner', active: true })).toBe(false)
  })

  it('allows changing a staff member while one owner exists', () => {
    expect(wouldOrphanOwners(rows, 's1', { role: 'staff', active: false })).toBe(false)
  })

  it('treats deactivating an already-inactive member as harmless', () => {
    expect(wouldOrphanOwners(rows, 'o2', { role: 'owner', active: false })).toBe(false)
  })
})

describe('staffErrorMessage', () => {
  it('prefers the detail the function sent', () => {
    expect(staffErrorMessage({ error: 'forbidden', detail: 'you cannot deactivate yourself' }))
      .toBe('you cannot deactivate yourself')
  })

  it('has a sentence for every code, detail or not', () => {
    expect(staffErrorMessage({ error: 'unauthorized' })).toBe('Your session has expired. Sign in again.')
    expect(staffErrorMessage({ error: 'forbidden' })).toBe('Only an owner can do this.')
    expect(staffErrorMessage({ error: 'invalid_request' })).toBe('Check the details and try again.')
    expect(staffErrorMessage({ error: 'email_taken' })).toBe('That email already has a login.')
    expect(staffErrorMessage({ error: 'not_found' })).toBe('That person is no longer on the roster. Pull to refresh.')
  })

  it('falls back for an unknown code or a missing body', () => {
    expect(staffErrorMessage({ error: 'teapot' })).toBe('Something went wrong. Try again.')
    expect(staffErrorMessage(null)).toBe('Something went wrong. Try again.')
  })
})

describe('profileWriteErrorMessage', () => {
  const knownMessages = [
    'only an owner can change role, segment access or active status',
    'you cannot change your own role',
    'you cannot deactivate yourself',
    'at least one active owner is required',
    'only an owner can create an owner account',
  ]

  it.each(knownMessages)('passes the guard trigger sentence through as-is: %s', (message) => {
    expect(profileWriteErrorMessage(message)).toBe(message)
  })

  it('matches a known sentence wrapped in PostgREST\'s own message', () => {
    expect(
      profileWriteErrorMessage(
        'new row violates row-level security policy: "you cannot deactivate yourself"',
      ),
    ).toBe('you cannot deactivate yourself')
  })

  it('falls back for an unrelated Postgres error', () => {
    expect(profileWriteErrorMessage('connection to server was lost')).toBe(
      'Something went wrong. Try again.',
    )
  })

  it('falls back for an empty or undefined message', () => {
    expect(profileWriteErrorMessage('')).toBe('Something went wrong. Try again.')
    expect(profileWriteErrorMessage(undefined)).toBe('Something went wrong. Try again.')
    expect(profileWriteErrorMessage(null)).toBe('Something went wrong. Try again.')
  })
})
