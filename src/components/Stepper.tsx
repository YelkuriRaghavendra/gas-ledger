interface StepperProps {
  value: number
  onChange: (value: number) => void
  min?: number
}

export function Stepper({ value, onChange, min = 0 }: StepperProps) {
  return (
    <div className="flex items-center justify-between rounded-lg border border-ink/20 bg-white px-2 py-2">
      <button
        type="button"
        onClick={() => onChange(Math.max(min, value - 1))}
        className="h-10 w-10 rounded-lg bg-cream text-xl font-bold text-ink"
      >
        −
      </button>
      <span className="text-2xl font-bold text-ink">{value}</span>
      <button
        type="button"
        onClick={() => onChange(value + 1)}
        className="h-10 w-10 rounded-lg bg-accent text-xl font-bold text-white"
      >
        +
      </button>
    </div>
  )
}
