import { describe, it, expect } from 'vitest'
import { normalizeEmail, validateCreate, validateSetActive } from './validation'

const valid = {
  action: 'create',
  name: 'Ramesh Kumar',
  email: 'ramesh@example.com',
  password: 'cylinder8',
  role: 'staff',
  segment_access: 'both',
}

const detail = (r: ReturnType<typeof validateCreate>) => (r.ok ? '' : r.detail)

describe('normalizeEmail', () => {
  it('trims and lowercases', () => {
    expect(normalizeEmail('  Ramesh@Gmail.COM ')).toBe('ramesh@gmail.com')
  })

  it('leaves an already-clean address alone', () => {
    expect(normalizeEmail('ramesh@gmail.com')).toBe('ramesh@gmail.com')
  })
})

describe('validateCreate', () => {
  it('accepts a well-formed body', () => {
    const r = validateCreate(valid)
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.value).toEqual({
        name: 'Ramesh Kumar',
        email: 'ramesh@example.com',
        password: 'cylinder8',
        role: 'staff',
        segment_access: 'both',
      })
    }
  })

  it('normalises the email it returns', () => {
    const r = validateCreate({ ...valid, email: '  Ramesh@Example.COM ' })
    expect(r.ok && r.value.email).toBe('ramesh@example.com')
  })

  it('trims the name it returns', () => {
    const r = validateCreate({ ...valid, name: '  Ramesh  ' })
    expect(r.ok && r.value.name).toBe('Ramesh')
  })

  it('rejects a non-object body', () => {
    expect(validateCreate(null).ok).toBe(false)
    expect(validateCreate('create').ok).toBe(false)
  })

  it('rejects an empty or whitespace-only name', () => {
    expect(detail(validateCreate({ ...valid, name: '' }))).toBe('Enter a name')
    expect(detail(validateCreate({ ...valid, name: '   ' }))).toBe('Enter a name')
  })

  it('accepts a 60-character name and rejects 61', () => {
    expect(validateCreate({ ...valid, name: 'a'.repeat(60) }).ok).toBe(true)
    expect(detail(validateCreate({ ...valid, name: 'a'.repeat(61) }))).toBe('Name is too long')
  })

  it('rejects a malformed email', () => {
    expect(detail(validateCreate({ ...valid, email: 'ramesh' }))).toBe('Enter a valid email address')
    expect(detail(validateCreate({ ...valid, email: 'ramesh@' }))).toBe('Enter a valid email address')
    expect(detail(validateCreate({ ...valid, email: '@example.com' }))).toBe('Enter a valid email address')
    expect(detail(validateCreate({ ...valid, email: 'ramesh@example' }))).toBe('Enter a valid email address')
    expect(detail(validateCreate({ ...valid, email: 'ram esh@example.com' }))).toBe('Enter a valid email address')
    expect(detail(validateCreate({ ...valid, email: 'a@b@example.com' }))).toBe('Enter a valid email address')
  })

  it('accepts an 8-character password and rejects 7', () => {
    expect(validateCreate({ ...valid, password: '12345678' }).ok).toBe(true)
    expect(detail(validateCreate({ ...valid, password: '1234567' })))
      .toBe('Password must be at least 8 characters')
  })

  it('does not trim the password', () => {
    const r = validateCreate({ ...valid, password: ' pass123 ' })
    expect(r.ok && r.value.password).toBe(' pass123 ')
  })

  it('rejects an unknown role', () => {
    expect(detail(validateCreate({ ...valid, role: 'admin' }))).toBe('Pick a role')
    expect(detail(validateCreate({ ...valid, role: undefined }))).toBe('Pick a role')
  })

  it('rejects an unknown segment access', () => {
    expect(detail(validateCreate({ ...valid, segment_access: 'all' }))).toBe('Pick a segment')
  })

  it('accepts every valid role and segment combination', () => {
    for (const role of ['owner', 'staff']) {
      for (const segment_access of ['commercial', 'domestic', 'both']) {
        expect(validateCreate({ ...valid, role, segment_access }).ok).toBe(true)
      }
    }
  })
})

describe('validateSetActive', () => {
  const id = '3f1c2b8a-9d44-4e21-8b77-0a1b2c3d4e5f'

  it('accepts a uuid and a boolean', () => {
    const r = validateSetActive({ action: 'set_active', user_id: id, active: false })
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.value).toEqual({ user_id: id, active: false })
  })

  it('rejects a non-uuid user id', () => {
    const r = validateSetActive({ action: 'set_active', user_id: '42', active: true })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.detail).toBe('Unknown user')
  })

  it('rejects a missing user id', () => {
    expect(validateSetActive({ action: 'set_active', active: true }).ok).toBe(false)
  })

  it('rejects a non-boolean active', () => {
    const r = validateSetActive({ action: 'set_active', user_id: id, active: 'false' })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.detail).toBe('Active must be true or false')
  })

  it('rejects a non-object body', () => {
    expect(validateSetActive(null).ok).toBe(false)
  })
})
