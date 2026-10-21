import { formatCurrency } from '../utils/format'
import type { HistoryEntry } from '../utils/statement'

export function SaleSummary({ t }: { t: HistoryEntry }) {
  return (
    <div className="mt-3 rounded-[14px] bg-[#FBF7F0] p-[13px]">
      <ul className="flex flex-col gap-[10px]">
        {t.lines.map((l, i) => (
          <li key={i} className="flex items-baseline justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate text-[13px] font-bold text-ink">{l.productName ?? 'Cylinder'}</p>
              <p className="text-[11.5px] font-semibold text-muted">
                {l.qty} × {l.qty > 0 ? formatCurrency(l.amount / l.qty) : '—'} <span className="text-subtle">per cylinder</span>
              </p>
            </div>
            <p className="shrink-0 font-display text-[15px] font-bold text-ink">{formatCurrency(l.amount)}</p>
          </li>
        ))}
      </ul>
      <div className="mt-3 flex items-center justify-between border-t border-borderMuted pt-3">
        <span className="text-[11px] font-bold uppercase tracking-[0.4px] text-subtle">Total</span>
        <span className="font-display text-[17px] font-bold text-ink">{formatCurrency(t.amount)}</span>
      </div>
      <div className={`mt-2 flex items-center justify-between rounded-[10px] px-[10px] py-[7px] text-[12px] font-bold ${t.paid ? 'bg-[#E6F3EC] text-[#1D7A4A]' : 'bg-[#FDECE4] text-[#C24B1A]'}`}>
        <span>{t.paid ? 'Received on the spot' : 'On credit — not received yet'}</span>
        <span>{t.paid ? `${formatCurrency(t.amount)}${t.method ? ` · ${t.method === 'upi' ? 'UPI' : 'Cash'}` : ''}` : formatCurrency(t.amount)}</span>
      </div>
    </div>
  )
}

