interface StepperProps {
  value: number
  onChange: (value: number) => void
  min?: number
  variant?: 'primary' | 'secondary'
}

export function Stepper({ value, onChange, min = 0, variant = 'primary' }: StepperProps) {
  if (variant === 'secondary') {
    return (
      <div className="flex h-[52px] items-center justify-between rounded-[14px] border-[1.5px] border-borderMuted bg-white px-2 py-[6px]">
        <button
          type="button"
          onClick={() => onChange(Math.max(min, value - 1))}
          className="flex h-[38px] w-[38px] items-center justify-center rounded-[10px] text-[22px] leading-none"
          style={{ backgroundColor: '#EAF4EE', color: '#2E8B57' }}
        >
          −
        </button>
        <span className="font-display text-xl font-bold text-ink">{value}</span>
        <button
          type="button"
          onClick={() => onChange(value + 1)}
          className="flex h-[38px] w-[38px] items-center justify-center rounded-[10px] text-[22px] leading-none"
          style={{ backgroundColor: '#EAF4EE', color: '#2E8B57' }}
        >
          +
        </button>
      </div>
    )
  }

  return (
    <div className="flex items-center justify-between rounded-2xl border-[1.5px] border-borderMuted bg-white px-[10px] py-2">
      <button
        type="button"
        onClick={() => onChange(Math.max(min, value - 1))}
        className="flex h-[46px] w-[46px] items-center justify-center rounded-xl bg-[#F1E7D6] text-[26px] font-semibold leading-none text-ink"
      >
        −
      </button>
      <span className="font-display text-[32px] font-bold text-ink">{value}</span>
      <button
        type="button"
        onClick={() => onChange(value + 1)}
        className="flex h-[46px] w-[46px] items-center justify-center rounded-xl bg-accent text-[26px] font-semibold leading-none text-white"
      >
        +
      </button>
    </div>
  )
}
