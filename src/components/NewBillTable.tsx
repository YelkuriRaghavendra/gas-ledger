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

interface NewBillTableProps {
  products: Product[]
  qtyByProduct: Record<number, number>
  priceByProduct: Record<number, string>
  emptiesByProduct: Record<number, number>
  onQty: (productId: number, value: number) => void
  onPrice: (productId: number, value: string) => void
  onEmpties: (productId: number, value: number) => void
  onToggleMatch: (productId: number) => void
  isMatched: (productId: number) => boolean
  comboHint: (productId: number) => string | null
  billTotal: number
}

export function NewBillTable({
  products,
  qtyByProduct,
  priceByProduct,
  emptiesByProduct,
  onQty,
  onPrice,
  onEmpties,
  onToggleMatch,
  isMatched,
  comboHint,
  billTotal,
}: NewBillTableProps) {
  const [editingPriceId, setEditingPriceId] = useState<number | null>(null)

  const itemCount = products.reduce((n, p) => n + (qtyByProduct[p.id] > 0 ? 1 : 0), 0)

  return (
    <div className="overflow-hidden rounded-[20px] bg-surface shadow-card">
      <div className="grid grid-cols-[1fr_124px_64px] gap-2 bg-cream px-4 py-[10px]">
        <div className="text-[9.5px] font-bold uppercase tracking-[0.5px] text-subtle">Item</div>
        <div className="text-center text-[9.5px] font-bold uppercase tracking-[0.5px] text-subtle">Qty</div>
        <div className="text-right text-[9.5px] font-bold uppercase tracking-[0.5px] text-subtle">Amount</div>
      </div>

      {KIND_ORDER.map((kind) => {
        const group = products.filter((p) => p.kind === kind)
        if (group.length === 0) return null
        return (
          <div key={kind}>
            <div className="bg-cream/60 px-4 pb-1 pt-[9px] text-[9.5px] font-bold uppercase tracking-[0.5px] text-subtle">
              {KIND_LABEL[kind]}
            </div>
            {group.map((p) => {
              const qty = qtyByProduct[p.id] ?? 0
              const price = Number(priceByProduct[p.id] || 0)
              const empties = emptiesByProduct[p.id] ?? 0
              const lineTotal = qty * price
              const hint = comboHint(p.id)
              const matched = isMatched(p.id)
              const isEditingPrice = editingPriceId === p.id

              return (
                <div
                  key={p.id}
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
                        value={priceByProduct[p.id] ?? ''}
                        onChange={(e) => onPrice(p.id, e.target.value)}
                        onBlur={() => setEditingPriceId(null)}
                        className="mt-[3px] h-[26px] w-[84px] rounded-[9px] border-[1.5px] border-[#2E8B57] bg-cream px-[8px] text-[13px] font-bold text-ink focus:outline-none"
                      />
                    ) : (
                      <button
                        type="button"
                        onClick={() => setEditingPriceId(p.id)}
                        className="mt-[3px] inline-flex items-center gap-1"
                      >
                        <span className="border-b border-dotted border-[#C4B9A8] text-[11px] font-semibold text-subtle">
                          ₹{priceByProduct[p.id] || 0} each
                        </span>
                        <span className="text-[9.5px] text-[#C4B9A8]">✎</span>
                      </button>
                    )}

                    {p.price_options && p.price_options.length > 0 && !isEditingPrice && (
                      <div className="mt-[5px] flex flex-wrap gap-[5px]">
                        {[{ label: 'Default', amount: p.price }, ...p.price_options].map((opt, idx) => {
                          const active = Number(priceByProduct[p.id] || 0) === opt.amount
                          return (
                            <button
                              key={idx}
                              type="button"
                              onClick={() => onPrice(p.id, String(opt.amount))}
                              className={`rounded-[8px] px-[8px] py-[3px] text-[10.5px] font-bold ${
                                active ? 'bg-[#2E8B57] text-white' : 'border border-[#2E8B57] bg-cream text-[#2E8B57]'
                              }`}
                            >
                              {opt.label} ₹{opt.amount}
                            </button>
                          )
                        })}
                      </div>
                    )}

                    {p.kind === 'cylinder' && qty > 0 && (
                      <div className="mt-[3px] flex items-center gap-[6px]">
                        <div className="flex items-center gap-[4px] rounded-[8px] bg-[#E7F5EC] px-[6px] py-[2px]">
                          <button
                            type="button"
                            onClick={() => onEmpties(p.id, Math.max(0, empties - 1))}
                            className="text-[13px] font-bold leading-none text-[#2E8B57]"
                          >
                            −
                          </button>
                          <span className="text-[10.5px] font-bold text-[#2E8B57]">{empties} empties in</span>
                          <button
                            type="button"
                            onClick={() => onEmpties(p.id, empties + 1)}
                            className="text-[13px] font-bold leading-none text-[#2E8B57]"
                          >
                            +
                          </button>
                        </div>
                        <button
                          type="button"
                          onClick={() => onToggleMatch(p.id)}
                          className="text-[9.5px] font-semibold text-subtle underline decoration-dotted"
                        >
                          {matched ? 'auto' : 'manual'}
                        </button>
                      </div>
                    )}

                    {hint && <p className="mt-[3px] text-[10.5px] font-semibold text-subtle">{hint}</p>}
                  </div>

                  <Stepper value={qty} onChange={(v) => onQty(p.id, v)} min={0} variant="secondary" tone="cream" size="sm" />

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
