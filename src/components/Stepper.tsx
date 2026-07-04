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
        <input
          type="text"
          inputMode="numeric"
          value={text}
          onChange={(e) => handleTextChange(e.target.value)}
          onBlur={handleBlur}
          className="w-16 border-none bg-transparent text-center font-display text-xl font-bold text-ink focus:outline-none"
        />
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
      <input
        type="text"
        inputMode="numeric"
        value={text}
        onChange={(e) => handleTextChange(e.target.value)}
        onBlur={handleBlur}
        className="w-20 border-none bg-transparent text-center font-display text-[32px] font-bold text-ink focus:outline-none"
      />
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
