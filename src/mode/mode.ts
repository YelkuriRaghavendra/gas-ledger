// Which side of the business the user is working in this session.
// Session-scoped on purpose: every fresh login asks again.
export type AppMode = 'commercial' | 'domestic'

const KEY = 'cylinder-tracker-mode'

export function getMode(): AppMode | null {
  const v = sessionStorage.getItem(KEY)
  return v === 'commercial' || v === 'domestic' ? v : null
}

export function setMode(mode: AppMode) {
  sessionStorage.setItem(KEY, mode)
}

export function clearMode() {
  sessionStorage.removeItem(KEY)
}
