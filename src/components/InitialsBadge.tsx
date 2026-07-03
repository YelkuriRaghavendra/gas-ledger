function initialsForName(name: string) {
  const parts = name.trim().split(/\s+/)
  return ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')).toUpperCase()
}

export function InitialsBadge({ name, size = 44, radius = 14 }: { name: string; size?: number; radius?: number }) {
  return (
    <div
      style={{ width: size, height: size, borderRadius: radius }}
      className="flex shrink-0 items-center justify-center bg-ink font-display font-bold text-white"
    >
      <span style={{ fontSize: size * 0.36 }}>{initialsForName(name)}</span>
    </div>
  )
}
