import { useEffect, useState } from 'react'

interface StepperProps {
  value: number
  onChange: (value: number) => void
  min?: number
  variant?: 'primary' | 'secondary'
}

export function Stepper({ value, onChange, min = 0, variant = 'primary' }: StepperProps) {
  const [text, setText] = useState(String(value))

  useEffect(() => {
    setText(String(value))
  }, [value])

  function handleTextChange(raw: string) {
    const digits = raw.replace(/\D/g, '')
    setText(digits)
    if (digits === '') return
    onChange(Math.max(min, Number(digits)))
  }

  function handleBlur() {
    if (text === '') setText(String(value))
  }

  const plusBg = variant === 'secondary' ? 'bg-[#2E8B57]' : 'bg-accent'

  return (
    <div className="flex items-center justify-between rounded-[14px] bg-cream p-[6px]">
      <button
        type="button"
        onClick={() => onChange(Math.max(min, value - 1))}
        className="flex h-[44px] w-[44px] shrink-0 items-center justify-center rounded-[11px] bg-surface text-[24px] font-semibold leading-none text-ink shadow-card active:scale-95"
      >
        −
      </button>
      <input
        type="text"
        inputMode="numeric"
        value={text}
        onChange={(e) => handleTextChange(e.target.value)}
        onBlur={handleBlur}
        className="min-w-0 flex-1 border-none bg-transparent text-center font-display text-[26px] font-bold text-ink focus:outline-none"
      />
      <button
        type="button"
        onClick={() => onChange(value + 1)}
        className={`flex h-[44px] w-[44px] shrink-0 items-center justify-center rounded-[11px] ${plusBg} text-[24px] font-semibold leading-none text-white active:scale-95`}
      >
        +
      </button>
    </div>
  )
}
