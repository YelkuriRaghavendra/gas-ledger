export function StatusPill({ owed }: { owed: number }) {
  if (owed <= 0) {
    return (
      <span
        className="inline-flex items-center gap-[5px] rounded-full px-[9px] py-1 text-xs font-bold"
        style={{ backgroundColor: '#EAF4EE', color: '#2E8B57' }}
      >
        Settled
      </span>
    )
  }
  return (
    <span
      className="inline-flex items-center gap-[5px] rounded-full px-[9px] py-1 text-xs font-bold"
      style={{ backgroundColor: '#FBE9E4', color: '#C23B22' }}
    >
      {owed} owed
    </span>
  )
}
