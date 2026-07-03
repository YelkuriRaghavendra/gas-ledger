import type { ReactNode } from 'react'

export function HeroCard({ children }: { children: ReactNode }) {
  return <div className="rounded-2xl bg-ink p-5 text-white">{children}</div>
}
