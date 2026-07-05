export function StatusPill({ owed }: { owed: number }) {
  const settled = owed <= 0
  const bg = settled ? '#EAF4EE' : '#FBE9E4'
  const color = settled ? '#2E8B57' : '#C23B22'
  return (
    <span
      className="inline-flex items-center gap-[6px] rounded-full px-[10px] py-[5px] text-[11.5px] font-bold"
      style={{ backgroundColor: bg, color }}
    >
      <span className="h-[6px] w-[6px] rounded-full" style={{ backgroundColor: color }} />
      {settled ? 'Settled' : `${owed} owed`}
    </span>
  )
}
