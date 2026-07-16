import type { ReactNode } from 'react'
import { BottomSheet } from './BottomSheet'

interface Row { k: string; v: string }
export function DetailModal({ open, onClose, icon, iconBg, iconColor, title, subtitle, amount, rows, created, createdBy, updated, updatedBy, actions }: {
  open: boolean; onClose: () => void; icon: ReactNode; iconBg: string; iconColor: string
  title: string; subtitle?: string; amount?: string; rows: Row[]; created: string; createdBy?: string; updated?: string; updatedBy?: string; actions?: ReactNode
}) {
  return (
    <BottomSheet open={open} onClose={onClose}>
      <div className="flex items-center gap-3 border-b border-borderMuted pb-4 pr-11">
        <div className="flex h-[46px] w-[46px] shrink-0 items-center justify-center rounded-[14px] text-[20px]" style={{ background: iconBg, color: iconColor }}>{icon}</div>
        <div className="min-w-0"><p className="font-display text-[17px] font-bold text-ink">{title}</p>{subtitle && <p className="text-[11.5px] font-semibold text-muted">{subtitle}</p>}</div>
        {amount && <p className="ml-auto shrink-0 font-display text-[20px] font-bold" style={{ color: iconColor }}>{amount}</p>}
      </div>
      <dl className="flex flex-col">
        {rows.map((r) => (
          <div key={r.k} className="flex justify-between border-b border-[#F1E9DB] py-[11px]">
            <dt className="text-[12.5px] font-semibold text-muted">{r.k}</dt>
            <dd className="text-right text-[13px] font-bold text-ink">{r.v}</dd>
          </div>
        ))}
      </dl>
      <div className="mt-3 rounded-[14px] bg-[#FBF7F0] px-[13px] py-[11px]">
        <div className="flex justify-between py-1"><span className="text-[10.5px] font-bold uppercase tracking-[0.4px] text-subtle">Created</span><span className="text-[11.5px] font-bold text-ink">{created}</span></div>
        {createdBy && <div className="flex justify-between py-1"><span className="text-[10.5px] font-bold uppercase tracking-[0.4px] text-subtle">Created by</span><span className="text-[11.5px] font-bold text-ink">{createdBy}</span></div>}
        {updated && <div className="flex justify-between py-1"><span className="text-[10.5px] font-bold uppercase tracking-[0.4px] text-subtle">Last updated</span><span className="text-[11.5px] font-bold text-ink">{updated}</span></div>}
        {updated && updatedBy && <div className="flex justify-between py-1"><span className="text-[10.5px] font-bold uppercase tracking-[0.4px] text-subtle">Last updated by</span><span className="text-[11.5px] font-bold text-ink">{updatedBy}</span></div>}
      </div>
      {actions && <div className="mt-4 flex gap-2">{actions}</div>}
    </BottomSheet>
  )
}
