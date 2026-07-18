import { Link } from 'react-router-dom'
import { emptiesOwed } from '../utils/format'

export interface CardItem { name: string; emptiesWithCustomers?: number; full: number; empty: number }

export function CylindersCard({ items, accent, linkLabel, linkTo }: {
  items: CardItem[]; accent: 'orange' | 'green'; linkLabel: string; linkTo: string
}) {
  const bigColor = accent === 'orange' ? '#F26B2C' : '#2E8B57'
  const linkColor = accent === 'orange' ? 'text-accent' : 'text-[#2E8B57]'
  return (
    <div className="mt-[18px]">
      <div className="mb-[11px] flex items-center justify-between">
        <h2 className="font-display text-[19px] font-bold tracking-[-0.3px] text-ink">Cylinders</h2>
        <Link to={linkTo} className={`text-[13px] font-bold ${linkColor}`}>{linkLabel} ›</Link>
      </div>
      <div className="grid grid-cols-2 gap-[11px]">
        {items.map((it) => (
          <div key={it.name} className="rounded-[18px] bg-surface p-[14px] shadow-card">
            <span className="inline-block rounded-[10px] bg-ink px-[10px] py-[4px] font-display text-[11.5px] font-bold text-white">{it.name}</span>
            {it.emptiesWithCustomers !== undefined && (() => {
              const e = emptiesOwed(it.emptiesWithCustomers)
              return (
                <>
                  <p className="mt-3 font-display text-[28px] font-bold leading-none" style={{ color: e.owedBy === 'agency' ? '#2E8B57' : bigColor }}>{e.count}</p>
                  <p className="mt-1 text-[10.5px] font-semibold text-subtle">{e.owedBy === 'agency' ? 'empties in advance' : 'empties pending'}</p>
                  <div className="my-[11px] h-px bg-borderMuted" />
                </>
              )
            })()}
            <div className={`flex gap-4 ${it.emptiesWithCustomers === undefined ? 'mt-[14px]' : ''}`}>
              <div><p className="font-display text-[21px] font-bold text-ink">{it.full}</p><p className="text-[10px] font-semibold text-subtle">full</p></div>
              <div><p className="font-display text-[21px] font-bold text-[#2E8B57]">{it.empty}</p><p className="text-[10px] font-semibold text-subtle">empty</p></div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
