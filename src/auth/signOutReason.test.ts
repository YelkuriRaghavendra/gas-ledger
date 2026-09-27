import { describe, it, expect } from 'vitest'
import { signOutMessage } from './signOutReason'

describe('signOutMessage', () => {
  it('explains a deactivated account without blaming the user', () => {
    expect(signOutMessage('inactive'))
      .toBe('Your access has been turned off. Ask the owner to turn it back on.')
  })

  it('explains a login with no profile row', () => {
    expect(signOutMessage('no-profile'))
      .toBe('Your login is not set up yet. Ask the owner to add you again.')
  })
})
