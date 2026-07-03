import { BottomSheet } from './BottomSheet'

interface QuickAddSheetProps {
  open: boolean
  onClose: () => void
  onNavigate: (path: string, state?: Record<string, unknown>) => void
}

const items = [
  { path: '/sale', label: 'New sale', description: 'Record cylinders sold' },
  { path: '/return', label: 'Log return', description: 'Empty cylinders back' },
  { path: '/payment', label: 'Record payment', description: 'Collect dues from customer' },
  { path: '/customers', label: 'Add customer', description: 'New account', state: { openAdd: true } },
]

export function QuickAddSheet({ open, onClose, onNavigate }: QuickAddSheetProps) {
  return (
    <BottomSheet open={open} onClose={onClose}>
      <h2 className="mb-4 text-lg font-bold text-ink">Quick add</h2>
      <div className="space-y-2">
        {items.map((item) => (
          <button
            key={item.path}
            onClick={() => onNavigate(item.path, item.state)}
            className="flex w-full items-center justify-between rounded-xl bg-white p-4 text-left shadow-sm"
          >
            <div>
              <p className="font-semibold text-ink">{item.label}</p>
              <p className="text-sm text-ink/60">{item.description}</p>
            </div>
          </button>
        ))}
      </div>
    </BottomSheet>
  )
}
