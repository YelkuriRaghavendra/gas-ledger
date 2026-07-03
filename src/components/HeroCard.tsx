import type { ReactNode } from 'react'

export function HeroCard({ children }: { children: ReactNode }) {
  return <div className="relative overflow-hidden rounded-[22px] bg-ink p-5 text-white">{children}</div>
}
