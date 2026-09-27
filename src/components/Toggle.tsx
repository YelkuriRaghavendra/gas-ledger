// A sliding on/off switch, for settings that take effect as a state rather
// than as part of a form submission. Built on a real <button> with
// role="switch" rather than a styled checkbox: the thumb has to animate, and
// an <input> that is visually replaced still needs the same aria wiring, so
// the checkbox buys nothing here.
//
// `onColor` exists because two of the switches are WhatsApp settings and read
// better in WhatsApp's green than in the app's orange.
export function Toggle({
  checked,
  onChange,
  disabled = false,
  label,
  onColor = '#E4571B',
}: {
  checked: boolean
  onChange: (next: boolean) => void
  disabled?: boolean
  label: string
  onColor?: string
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      style={checked && !disabled ? { backgroundColor: onColor } : undefined}
      className={`relative h-[30px] w-[50px] shrink-0 rounded-full transition-colors disabled:opacity-40 ${
        checked ? (disabled ? 'bg-subtle' : '') : 'bg-[#DCD3C4]'
      }`}
    >
      <span
        className={`absolute top-[3px] h-6 w-6 rounded-full bg-surface shadow-card transition-[left] duration-200 ${
          checked ? 'left-[23px]' : 'left-[3px]'
        }`}
      />
    </button>
  )
}
