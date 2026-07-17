import type { PriceOption } from '../types/db'

// Edits a list of named alternate prices for a product. The base Price field
// is the default; these are extra choices staff can pick when billing.
export function PriceOptionsEditor({
  value,
  onChange,
}: {
  value: PriceOption[]
  onChange: (next: PriceOption[]) => void
}) {
  function update(i: number, patch: Partial<PriceOption>) {
    onChange(value.map((o, idx) => (idx === i ? { ...o, ...patch } : o)))
  }
  return (
    <div className="mb-3">
      <p className="mb-[7px] text-[11px] font-bold uppercase tracking-[0.5px] text-muted">Alternate prices (optional)</p>
      <div className="flex flex-col gap-2">
        {value.map((o, i) => (
          <div key={i} className="flex gap-2">
            <input
              placeholder="Label (e.g. Commercial)"
              value={o.label}
              onChange={(e) => update(i, { label: e.target.value })}
              className="h-[46px] min-w-0 flex-1 rounded-[12px] border border-borderMuted bg-cream px-[12px] text-[14px] font-bold text-ink"
            />
            <input
              type="number"
              min="0"
              step="0.01"
              placeholder="₹"
              value={o.amount || ''}
              onChange={(e) => update(i, { amount: Number(e.target.value || 0) })}
              className="h-[46px] w-[84px] shrink-0 rounded-[12px] border border-borderMuted bg-cream px-[12px] text-[14px] font-bold text-ink"
            />
            <button
              type="button"
              onClick={() => onChange(value.filter((_, idx) => idx !== i))}
              aria-label="Remove price"
              className="h-[46px] w-[38px] shrink-0 rounded-[12px] text-[20px] font-bold leading-none text-muted active:scale-95"
            >
              ×
            </button>
          </div>
        ))}
      </div>
      <button
        type="button"
        onClick={() => onChange([...value, { label: '', amount: 0 }])}
        className="mt-2 text-[13px] font-bold text-[#2E8B57]"
      >
        + Add price
      </button>
    </div>
  )
}
