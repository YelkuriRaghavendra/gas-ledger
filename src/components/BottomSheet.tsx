import type { ReactNode } from 'react'

interface BottomSheetProps {
  open: boolean
  onClose: () => void
  children: ReactNode
}

export function BottomSheet({ open, onClose, children }: BottomSheetProps) {
  if (!open) return null
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-5 bg-[rgba(20,16,12,0.42)]"
      style={{ animation: 'backdropFadeIn 0.25s ease-out' }}
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-md rounded-[22px] bg-cream p-5"
        style={{ animation: 'sheetPop 0.25s ease-out' }}
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="absolute right-3 top-3 flex h-9 w-9 items-center justify-center rounded-full bg-surface text-[20px] font-bold leading-none text-muted shadow-card active:scale-95"
        >
          ×
        </button>
        {children}
      </div>
    </div>
  )
}
