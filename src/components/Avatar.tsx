const PALETTE = ['#E4571B', '#2F6B4F', '#2F5C8A', '#7A4FA3', '#B5852B', '#A3355C']

function colorForName(name: string) {
  let hash = 0
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) >>> 0
  return PALETTE[hash % PALETTE.length]
}

function initialsForName(name: string) {
  const parts = name.trim().split(/\s+/)
  const first = parts[0]?.[0] ?? ''
  const second = parts[1]?.[0] ?? ''
  return (first + second).toUpperCase()
}

export function Avatar({ name, size = 48 }: { name: string; size?: number }) {
  return (
    <div
      style={{ width: size, height: size, backgroundColor: colorForName(name) }}
      className="flex shrink-0 items-center justify-center rounded-2xl font-bold text-white"
    >
      {initialsForName(name)}
    </div>
  )
}
