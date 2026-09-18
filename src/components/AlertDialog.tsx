import { BottomSheet } from './BottomSheet'

// A centred, single-button dialog for telling the user something they must act
// on before continuing — a form that can't be saved yet, most often. Use it for
// blocking messages only; anything the user can safely ignore belongs inline.
//
// Passing `onConfirm` turns it into a two-button confirm/cancel dialog for a
// consequential action: Cancel closes without acting, `actionLabel` runs
// `onConfirm`. Omit it for the plain single-button alert.
export function AlertDialog({
  open,
  onClose,
  title,
  message,
  actionLabel = 'OK',
  onConfirm,
  cancelLabel = 'Cancel',
}: {
  open: boolean
  onClose: () => void
  title: string
  message?: string
  actionLabel?: string
  onConfirm?: () => void
  cancelLabel?: string
}) {
  return (
    <BottomSheet open={open} onClose={onClose}>
      <div className="pr-11">
        <p className="font-display text-[18px] font-bold tracking-[-0.3px] text-ink">{title}</p>
        {message && <p className="mt-[6px] text-[13.5px] font-medium text-muted">{message}</p>}
      </div>
      <div className="mt-5 flex gap-2">
        {onConfirm && (
          <button
            type="button"
            onClick={onClose}
            className="h-[50px] flex-1 rounded-[14px] border-[1.5px] border-borderMuted bg-surface text-[15px] font-bold text-ink transition active:scale-[0.99]"
          >
            {cancelLabel}
          </button>
        )}
        <button
          type="button"
          onClick={onConfirm ?? onClose}
          className="h-[50px] flex-1 rounded-[14px] bg-gradient-to-br from-accentSoft to-accent text-[15px] font-bold text-white shadow-glow transition active:scale-[0.99]"
        >
          {actionLabel}
        </button>
      </div>
    </BottomSheet>
  )
}
