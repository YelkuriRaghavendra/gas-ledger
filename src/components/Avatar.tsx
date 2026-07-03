const PALETTE = ['#E4571B', '#2E8B57', '#3B6EA5', '#8A5AC2', '#C2833B', '#B5405A']

function colorForId(id: number) {
  return PALETTE[(id - 1) % PALETTE.length]
}

function initialsForName(name: string) {
  const parts = name.trim().split(/\s+/)
  const first = parts[0]?.[0] ?? ''
  const second = parts[1]?.[0] ?? ''
  return (first + second).toUpperCase()
}

export function Avatar({ id, name, size = 48 }: { id: number; name: string; size?: number }) {
  return (
    <div
      style={{ width: size, height: size, backgroundColor: colorForId(id) }}
      className="flex shrink-0 items-center justify-center rounded-[30%] font-display font-bold text-white"
    >
      <span style={{ fontSize: size * 0.36 }}>{initialsForName(name)}</span>
    </div>
  )
}
