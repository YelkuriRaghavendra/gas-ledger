import type { ReactNode } from 'react'

interface BottomSheetProps {
  open: boolean
  onClose: () => void
  children: ReactNode
}

export function BottomSheet({ open, onClose, children }: BottomSheetProps) {
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-[rgba(20,16,12,0.42)]" onClick={onClose}>
      <div
        className="w-full max-w-md rounded-t-[26px] bg-cream px-5 pb-[30px] pt-[10px]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mx-auto mb-[18px] mt-[6px] h-[5px] w-10 rounded-[3px] bg-[#D8CDBA]" />
        {children}
      </div>
    </div>
  )
}
