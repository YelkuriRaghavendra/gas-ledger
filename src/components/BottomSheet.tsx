import type { ReactNode } from 'react'

interface BottomSheetProps {
  open: boolean
  onClose: () => void
  children: ReactNode
  slideUp?: boolean
}

export function BottomSheet({ open, onClose, children, slideUp }: BottomSheetProps) {
  if (!open) return null
  return (
    <div
      className={`fixed inset-0 z-50 flex bg-[rgba(20,16,12,0.42)] ${slideUp ? 'items-end' : 'items-center justify-center p-5'}`}
      style={{ animation: 'backdropFadeIn 0.25s ease-out' }}
      onClick={onClose}
    >
      <div
        className={`relative w-full bg-cream p-5 ${slideUp ? 'rounded-t-[22px]' : 'max-w-md rounded-[22px]'}`}
        style={{ animation: slideUp ? 'sheetSlideUp 0.3s ease-out' : 'sheetPop 0.25s ease-out' }}
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
