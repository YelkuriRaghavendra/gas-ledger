export function StatusPill({ owed }: { owed: number }) {
  if (owed <= 0) {
    return <span className="rounded-full bg-green-100 px-3 py-1 text-xs font-semibold text-green-700">Settled</span>
  }
  return <span className="rounded-full bg-red-100 px-3 py-1 text-xs font-semibold text-red-700">{owed} owed</span>
}
