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
          className="absolute right-3.5 top-3.5 flex h-8 w-8 items-center justify-center rounded-full bg-surface text-subtle hover:text-ink shadow-card transition active:scale-95 z-10"
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="12" />
            <path d="M18 6 6 18M6 6l12 12" />
          </svg>
        </button>
        {children}
      </div>
    </div>
  )
}
