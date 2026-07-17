import { useState } from 'react'
import { Stepper } from './Stepper'
import { formatCurrency } from '../utils/format'
import type { Product, ProductKind } from '../types/db'

export const KIND_LABEL: Record<ProductKind, string> = {
  cylinder: 'Cylinders',
  accessory: 'Accessories',
  service: 'Services',
}

const KIND_ORDER: ProductKind[] = ['cylinder', 'accessory', 'service']

// One billable line. A product with alternate prices expands into several
// rows (one per price); a plain product is a single row. `key` is unique per
// row; `label` names the price variant (null for a plain single-price item).
export interface BillRow {
  key: string
  product: Product
  label: string | null
  price: number
}

interface NewBillTableProps {
  rows: BillRow[]
  qtyByKey: Record<string, number>
  priceByKey: Record<string, string>
  emptiesByKey: Record<string, number>
  onQty: (key: string, value: number) => void
  onPrice: (key: string, value: string) => void
  onEmpties: (key: string, value: number) => void
  onToggleMatch: (key: string) => void
  isMatched: (key: string) => boolean
  comboHint: (productId: number) => string | null
  billTotal: number
}

export function NewBillTable({
  rows,
  qtyByKey,
  priceByKey,
  emptiesByKey,
  onQty,
  onPrice,
  onEmpties,
  onToggleMatch,
  isMatched,
  comboHint,
  billTotal,
}: NewBillTableProps) {
  const [editingPriceKey, setEditingPriceKey] = useState<string | null>(null)

  const itemCount = rows.reduce((n, r) => n + (qtyByKey[r.key] > 0 ? 1 : 0), 0)

  return (
    <div className="overflow-hidden rounded-[20px] bg-surface shadow-card">
      <div className="grid grid-cols-[1fr_124px_64px] gap-2 bg-cream px-4 py-[10px]">
        <div className="text-[9.5px] font-bold uppercase tracking-[0.5px] text-subtle">Item</div>
        <div className="text-center text-[9.5px] font-bold uppercase tracking-[0.5px] text-subtle">Qty</div>
        <div className="text-right text-[9.5px] font-bold uppercase tracking-[0.5px] text-subtle">Amount</div>
      </div>

      {KIND_ORDER.map((kind) => {
        const group = rows.filter((r) => r.product.kind === kind)
        if (group.length === 0) return null
        return (
          <div key={kind}>
            <div className="bg-cream/60 px-4 pb-1 pt-[9px] text-[9.5px] font-bold uppercase tracking-[0.5px] text-subtle">
              {KIND_LABEL[kind]}
            </div>
            {group.map((r) => {
              const p = r.product
              const qty = qtyByKey[r.key] ?? 0
              const price = Number(priceByKey[r.key] || 0)
              const empties = emptiesByKey[r.key] ?? 0
              const lineTotal = qty * price
              const hint = comboHint(p.id)
              const matched = isMatched(r.key)
              const isEditingPrice = editingPriceKey === r.key

              return (
                <div
                  key={r.key}
                  className={`grid grid-cols-[1fr_124px_64px] items-center gap-2 border-t border-borderMuted px-4 py-[11px] ${
                    qty > 0 ? 'bg-[#F3FAF5]' : ''
                  }`}
                >
                  <div className="min-w-0">
                    <p className="truncate text-[14px] font-bold text-ink">{p.name}</p>

                    {isEditingPrice ? (
                      <input
                        autoFocus
                        type="number"
                        min="0"
                        step="0.01"
                        value={priceByKey[r.key] ?? ''}
                        onChange={(e) => onPrice(r.key, e.target.value)}
                        onBlur={() => setEditingPriceKey(null)}
                        className="mt-[3px] h-[26px] w-[84px] rounded-[9px] border-[1.5px] border-[#2E8B57] bg-cream px-[8px] text-[13px] font-bold text-ink focus:outline-none"
                      />
                    ) : (
                      <button
                        type="button"
                        onClick={() => setEditingPriceKey(r.key)}
                        className="mt-[3px] inline-flex items-center gap-1"
                      >
                        <span className="border-b border-dotted border-[#C4B9A8] text-[11px] font-semibold text-subtle">
                          ₹{priceByKey[r.key] || 0} each
                        </span>
                        <span className="text-[9.5px] text-[#C4B9A8]">✎</span>
                      </button>
                    )}

                    {p.kind === 'cylinder' && qty > 0 && (
                      <div className="mt-[3px] flex items-center gap-[6px]">
                        <div className="flex items-center gap-[4px] rounded-[8px] bg-[#E7F5EC] px-[6px] py-[2px]">
                          <button
                            type="button"
                            onClick={() => onEmpties(r.key, Math.max(0, empties - 1))}
                            className="text-[13px] font-bold leading-none text-[#2E8B57]"
                          >
                            −
                          </button>
                          <span className="text-[10.5px] font-bold text-[#2E8B57]">{empties} empties in</span>
                          <button
                            type="button"
                            onClick={() => onEmpties(r.key, empties + 1)}
                            className="text-[13px] font-bold leading-none text-[#2E8B57]"
                          >
                            +
                          </button>
                        </div>
                        <button
                          type="button"
                          onClick={() => onToggleMatch(r.key)}
                          className="text-[9.5px] font-semibold text-subtle underline decoration-dotted"
                        >
                          {matched ? 'auto' : 'manual'}
                        </button>
                      </div>
                    )}

                    {hint && <p className="mt-[3px] text-[10.5px] font-semibold text-subtle">{hint}</p>}
                  </div>

                  <Stepper value={qty} onChange={(v) => onQty(r.key, v)} min={0} variant="secondary" tone="cream" size="sm" />

                  <p className={`text-right font-display text-[15px] font-bold ${qty > 0 ? 'text-ink' : 'text-[#CFC5B5]'}`}>
                    {qty > 0 ? formatCurrency(lineTotal) : '—'}
                  </p>
                </div>
              )
            })}
          </div>
        )
      })}

      <div className="flex items-center justify-between border-t-2 border-borderMuted bg-cream/60 px-4 py-[14px]">
        <span className="text-[12px] font-bold uppercase tracking-[0.4px] text-muted">
          Bill total{itemCount > 0 ? ` · ${itemCount} item${itemCount === 1 ? '' : 's'}` : ''}
        </span>
        <span className="font-display text-[22px] font-bold text-[#2E8B57]">{formatCurrency(billTotal)}</span>
      </div>
    </div>
  )
}
