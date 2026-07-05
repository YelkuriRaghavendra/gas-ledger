import { useEffect, useState } from 'react'

interface StepperProps {
  value: number
  onChange: (value: number) => void
  min?: number
  variant?: 'primary' | 'secondary'
  tone?: 'cream' | 'surface'
  size?: 'md' | 'sm'
}

export function Stepper({ value, onChange, min = 0, variant = 'primary', tone = 'cream', size = 'md' }: StepperProps) {
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
  const trackBg = tone === 'surface' ? 'bg-surface border border-borderMuted' : 'bg-cream'
  const minusBg = tone === 'surface' ? 'bg-cream' : 'bg-surface'
  const btnSize = size === 'sm' ? 'h-[36px] w-[36px] rounded-[10px] text-[20px]' : 'h-[44px] w-[44px] rounded-[11px] text-[24px]'
  const numSize = size === 'sm' ? 'text-[22px]' : 'text-[26px]'

  return (
    <div className={`flex items-center justify-between rounded-[14px] p-[6px] ${trackBg}`}>
      <button
        type="button"
        onClick={() => onChange(Math.max(min, value - 1))}
        className={`flex ${btnSize} shrink-0 items-center justify-center ${minusBg} font-semibold leading-none text-ink shadow-card active:scale-95`}
      >
        −
      </button>
      <input
        type="text"
        inputMode="numeric"
        value={text}
        onChange={(e) => handleTextChange(e.target.value)}
        onBlur={handleBlur}
        className={`min-w-0 flex-1 border-none bg-transparent text-center font-display ${numSize} font-bold text-ink focus:outline-none`}
      />
      <button
        type="button"
        onClick={() => onChange(value + 1)}
        className={`flex ${btnSize} shrink-0 items-center justify-center ${plusBg} font-semibold leading-none text-white active:scale-95`}
      >
        +
      </button>
    </div>
  )
}
