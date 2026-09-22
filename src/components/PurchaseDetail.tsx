import { BottomSheet } from './BottomSheet'
import { formatCurrency, formatDate, formatUpdated } from '../utils/format'
import { emptiesGiven, purchaseTitle } from '../utils/purchases'
import type { PurchaseOrderWithLines } from '../hooks/usePurchaseOrders'
import truckMark from '../assets/truck.png'

interface PurchaseDetailProps {
  purchase: PurchaseOrderWithLines
  productNameById: Map<number, string>
  profileNames: Map<string, string>
  isOwner: boolean
  onClose: () => void
  onEdit: () => void
  onDelete: () => void
}

/**
 * Purchase-specific detail sheet. The shared DetailModal renders flat
 * key/value rows, which cannot show per-cylinder rates or the empties figure
 * with any weight — and widening it would change four other screens.
 */
export function PurchaseDetail({
  purchase,
  productNameById,
  profileNames,
  isOwner,
  onClose,
  onEdit,
  onDelete,
}: PurchaseDetailProps) {
  const empties = emptiesGiven(purchase)
  const updated = formatUpdated(purchase.updated_at, purchase.created_at)

  return (
    <BottomSheet open onClose={onClose} slideUp>
      <div className="flex items-center gap-3 pr-10">
        <img src={truckMark} alt="" className="h-[46px] w-[46px] shrink-0 object-contain" />
        <div className="min-w-0 flex-1">
          <p className="font-display text-[17px] font-bold leading-tight tracking-[-0.2px] text-ink">
            {purchaseTitle(purchase, productNameById)}
          </p>
          <p className="mt-[3px] text-[11.5px] font-bold text-muted">
            {purchase.po_number} · {formatDate(purchase.created_at)}
          </p>
        </div>
      </div>

      <div className="mt-4 flex items-stretch gap-[9px]">
        <div className="flex-1 rounded-[16px] bg-surface px-[15px] py-[13px] shadow-card">
          <p className="text-[9.5px] font-extrabold uppercase tracking-[0.6px] text-subtle">Order total</p>
          <p className="mt-1 font-display text-[23px] font-bold tracking-[-0.5px] text-ink">
            {formatCurrency(purchase.total_amount)}
          </p>
        </div>
        <div className="w-[118px] rounded-[16px] bg-surface px-[15px] py-[13px] shadow-card">
          <p className="text-[9.5px] font-extrabold uppercase tracking-[0.6px] text-subtle">Empties out</p>
          <p className="mt-1 font-display text-[23px] font-bold tracking-[-0.5px] text-ink">{empties}</p>
        </div>
      </div>

      <div className="mt-[10px] rounded-[16px] bg-surface px-[15px] shadow-card">
        {purchase.purchase_lines.map((line, i) => {
          const name = productNameById.get(line.product_id) ?? 'Cylinders'
          const rate = line.qty > 0 ? Number(line.amount ?? 0) / line.qty : 0
          return (
            <div
              key={line.id}
              className={`flex items-center justify-between py-3 ${
                i < purchase.purchase_lines.length - 1 ? 'border-b border-[#F2EDE4]' : ''
              }`}
            >
              <div className="min-w-0 flex-1 pr-3">
                <p className="truncate text-[13px] font-extrabold text-ink">{name}</p>
                <p className="mt-[2px] text-[10.5px] font-bold text-subtle">
                  {line.qty} {line.qty === 1 ? 'cylinder' : 'cylinders'}
                  {rate > 0 && ` @ ${formatCurrency(rate)}`}
                  {line.empties_given > 0 && ` · ${line.empties_given} empties back`}
                </p>
              </div>
              <p className="shrink-0 font-display text-[14px] font-bold text-ink">
                {formatCurrency(line.amount ?? 0)}
              </p>
            </div>
          )
        })}
      </div>

      {purchase.note && (
        <p className="mt-[10px] rounded-[14px] bg-surface px-[15px] py-3 text-[12.5px] font-semibold text-muted shadow-card">
          {purchase.note}
        </p>
      )}

      <div className="mt-3 px-[3px]">
        <div className="flex justify-between py-[6px] text-[11.5px]">
          <span className="font-bold text-subtle">Recorded</span>
          <span className="font-bold text-ink">
            {formatDate(purchase.created_at)}
            {purchase.created_by && ` · ${profileNames.get(purchase.created_by) ?? '—'}`}
          </span>
        </div>
        {updated && (
          <div className="flex justify-between py-[6px] text-[11.5px]">
            <span className="font-bold text-subtle">Last edited</span>
            <span className="font-bold text-ink">
              {updated}
              {purchase.updated_by && ` · ${profileNames.get(purchase.updated_by) ?? '—'}`}
            </span>
          </div>
        )}
      </div>

      {isOwner && (
        <div className="mt-[18px] flex gap-[9px]">
          <button
            type="button"
            onClick={onEdit}
            className="h-[50px] flex-1 rounded-[15px] bg-gradient-to-br from-accentSoft to-accent text-sm font-extrabold text-white shadow-glow transition active:scale-[0.99]"
          >
            Edit purchase
          </button>
          <button
            type="button"
            onClick={onDelete}
            aria-label="Delete purchase"
            className="flex h-[50px] w-[50px] items-center justify-center rounded-[15px] bg-[#FBEAE6] transition active:scale-95"
          >
            <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="#C23B22" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 6h18" />
              <path d="M8 6V4h8v2" />
              <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
            </svg>
          </button>
        </div>
      )}
    </BottomSheet>
  )
}
