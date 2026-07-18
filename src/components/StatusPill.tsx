export function StatusPill({ owed }: { owed: number }) {
  const credit = owed < 0
  const settled = owed === 0
  const bg = owed > 0 ? '#FBE9E4' : '#EAF4EE'
  const color = owed > 0 ? '#C23B22' : '#2E8B57'
  const label = credit ? `${-owed} advance` : settled ? 'Settled' : `${owed} pending`
  return (
    <span
      className="inline-flex items-center gap-[6px] rounded-full px-[10px] py-[5px] text-[11.5px] font-bold"
      style={{ backgroundColor: bg, color }}
    >
      <span className="h-[6px] w-[6px] rounded-full" style={{ backgroundColor: color }} />
      {label}
    </span>
  )
}
