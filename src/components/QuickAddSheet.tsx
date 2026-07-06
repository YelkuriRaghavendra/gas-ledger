import { BottomSheet } from './BottomSheet'
import { PlusIcon, ReturnIcon, CreditCardIcon, UserPlusIcon, TruckIcon } from './icons'

interface QuickAddSheetProps {
  open: boolean
  onClose: () => void
  onNavigate: (path: string) => void
}

const items = [
  {
    path: '/sale',
    label: 'New sale',
    description: 'Record cylinders sold',
    iconBg: '#FBEDE4',
    Icon: PlusIcon,
    iconColor: '#E4571B',
  },
  {
    path: '/return',
    label: 'Log return',
    description: 'Empty cylinders back',
    iconBg: '#EAF4EE',
    Icon: ReturnIcon,
    iconColor: '#2E8B57',
  },
  {
    path: '/payment',
    label: 'Record payment',
    description: 'Collect dues from customer',
    iconBg: '#E8EEF6',
    Icon: CreditCardIcon,
    iconColor: '#3B6EA5',
  },
  {
    path: '/customers/new',
    label: 'Add customer',
    description: 'New account',
    iconBg: '#EDE7DA',
    Icon: UserPlusIcon,
    iconColor: '#211913',
  },
  {
    path: '/purchases/new',
    label: 'Record purchase',
    description: 'Cylinders in from supplier',
    iconBg: '#FBEDE4',
    Icon: TruckIcon,
    iconColor: '#E4571B',
  },
]

export function QuickAddSheet({ open, onClose, onNavigate }: QuickAddSheetProps) {
  return (
    <BottomSheet open={open} onClose={onClose} slideUp>
      <h2 className="mb-4 font-display text-[19px] font-bold text-ink">Quick add</h2>
      <div className="flex flex-col gap-[11px]">
        {items.map(({ path, label, description, iconBg, Icon, iconColor }) => (
          <button
            key={path}
            onClick={() => onNavigate(path)}
            className="flex items-center gap-[14px] rounded-2xl border border-[#EBE1D1] bg-white p-[15px] text-left"
          >
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[13px]" style={{ backgroundColor: iconBg }}>
              <Icon size={22} color={iconColor} strokeWidth={2.2} />
            </div>
            <div>
              <p className="text-[15px] font-bold text-ink">{label}</p>
              <p className="text-[12.5px] font-medium text-[#9A8F80]">{description}</p>
            </div>
          </button>
        ))}
      </div>
    </BottomSheet>
  )
}
