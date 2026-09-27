// Carries the reason for an involuntary sign-out from AuthContext across the
// redirect to /login. sessionStorage rather than router state because the
// sign-out is triggered from an effect, not from a navigation.

const KEY = 'cylinder-tracker-signout-reason'

export type SignOutReason = 'inactive' | 'no-profile'

export function setSignOutReason(reason: SignOutReason): void {
  try {
    sessionStorage.setItem(KEY, reason)
  } catch {
    // Private mode, or no storage at all. The user lands on the login screen
    // without an explanation, which is the pre-existing behaviour.
  }
}

export function takeSignOutReason(): SignOutReason | null {
  try {
    const value = sessionStorage.getItem(KEY)
    if (value) sessionStorage.removeItem(KEY)
    return value === 'inactive' || value === 'no-profile' ? value : null
  } catch {
    return null
  }
}

export function signOutMessage(reason: SignOutReason): string {
  return reason === 'inactive'
    ? 'Your access has been turned off. Ask the owner to turn it back on.'
    : 'Your login is not set up yet. Ask the owner to add you again.'
}
