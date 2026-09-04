import { BottomSheet } from './BottomSheet'

// A centred, single-button dialog for telling the user something they must act
// on before continuing — a form that can't be saved yet, most often. Use it for
// blocking messages only; anything the user can safely ignore belongs inline.
export function AlertDialog({
  open,
  onClose,
  title,
  message,
  actionLabel = 'OK',
}: {
  open: boolean
  onClose: () => void
  title: string
  message?: string
  actionLabel?: string
}) {
  return (
    <BottomSheet open={open} onClose={onClose}>
      <div className="pr-11">
        <p className="font-display text-[18px] font-bold tracking-[-0.3px] text-ink">{title}</p>
        {message && <p className="mt-[6px] text-[13.5px] font-medium text-muted">{message}</p>}
      </div>
      <button
        type="button"
        onClick={onClose}
        className="mt-5 h-[50px] w-full rounded-[14px] bg-gradient-to-br from-accentSoft to-accent text-[15px] font-bold text-white shadow-glow transition active:scale-[0.99]"
      >
        {actionLabel}
      </button>
    </BottomSheet>
  )
}
