import { useEffect, useMemo, useState } from 'react'
import {
  HistoryGroup,
  StatementPeriod,
  filterGroupsByPeriod,
  generatePdfBlob,
  generatePdfHtml,
  periodRangeLabel,
  statementFilename,
} from '../utils/statement'
import { formatCurrency } from '../utils/format'
import { ChevronLeftIcon, DownloadIcon } from './icons'

interface StatementDialogProps {
  open: boolean
  onClose: () => void
  customerName: string
  amountDue: number
  groups: HistoryGroup[]
  customer: { phone: string | null; address: string | null }
  agency: { name: string; phone: string | null; address: string | null } | null
}

const PERIODS: { value: StatementPeriod; label: string }[] = [
  { value: 'this-month', label: 'This month' },
  { value: 'last-month', label: 'Last month' },
  { value: 'all', label: 'All time' },
  { value: 'custom', label: 'Custom' },
]

function pad(n: number) {
  return String(n).padStart(2, '0')
}

function toDateInputValue(d: Date) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

export function StatementDialog({ open, onClose, customerName, amountDue, groups, customer, agency }: StatementDialogProps) {
  const now = new Date()
  const [period, setPeriod] = useState<StatementPeriod>('this-month')
  const [from, setFrom] = useState(toDateInputValue(new Date(now.getFullYear(), now.getMonth(), 1)))
  const [to, setTo] = useState(toDateInputValue(now))
  // The PDF is rasterised from HTML (async), so build it ahead of time and keep
  // it ready. This also lets the share fire synchronously inside the user's tap
  // — navigator.share needs an active user gesture, which an await would consume.
  const [pdfBlob, setPdfBlob] = useState<Blob | null>(null)
  const [building, setBuilding] = useState(false)

  // Refresh the custom-range defaults each time the screen opens so they don't
  // go stale if the component stays mounted across a month boundary.
  useEffect(() => {
    if (open) {
      const today = new Date()
      setFrom(toDateInputValue(new Date(today.getFullYear(), today.getMonth(), 1)))
      setTo(toDateInputValue(today))
      setPeriod('this-month')
    }
  }, [open])

  const filtered = useMemo(
    () => filterGroupsByPeriod(groups, period, from, to),
    [groups, period, from, to],
  )

  // The preview renders the same markup generatePdfBlob rasterises, so what is
  // on screen cannot drift from what gets shared, printed or downloaded.
  const previewHtml = useMemo(
    () => generatePdfHtml(customerName, customer.phone, customer.address, amountDue, filtered, agency),
    [customerName, customer.phone, customer.address, amountDue, filtered, agency],
  )

  useEffect(() => {
    if (!open) {
      setPdfBlob(null)
      return
    }
    let cancelled = false
    setBuilding(true)
    setPdfBlob(null)
    generatePdfBlob(customerName, customer.phone, customer.address, amountDue, filtered, agency)
      .then((blob) => {
        if (!cancelled) setPdfBlob(blob)
      })
      .catch(() => {
        if (!cancelled) setPdfBlob(null)
      })
      .finally(() => {
        if (!cancelled) setBuilding(false)
      })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, filtered, amountDue, customerName])

  function summaryText() {
    const business = agency?.name || 'Statement'
    return `${business} — ${customerName}: ${formatCurrency(amountDue)} due (${periodRangeLabel(period, from, to)})`
  }

  function handleDownloadPdf() {
    if (!pdfBlob) return
    const url = URL.createObjectURL(pdfBlob)
    const a = document.createElement('a')
    a.href = url
    a.download = statementFilename(customerName)
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  async function handleShare() {
    if (!pdfBlob) return
    const file = new File([pdfBlob], statementFilename(customerName), { type: 'application/pdf' })
    const business = agency?.name || 'Statement'
    if (typeof navigator !== 'undefined' && navigator.canShare && navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title: `${business} statement`, text: summaryText() })
      } catch {
        // user cancelled the share sheet (AbortError) — nothing to do
      }
    } else {
      // No file-share support (desktop) — fall back to a text-only WhatsApp message.
      window.open(`https://wa.me/?text=${encodeURIComponent(summaryText())}`, '_blank')
    }
  }

  function handlePrint() {
    const blob = new Blob([previewHtml], { type: 'text/html' })
    const url = URL.createObjectURL(blob)
    const win = window.open(url, '_blank')
    if (win) setTimeout(() => { win.print(); URL.revokeObjectURL(url) }, 600)
    else URL.revokeObjectURL(url)
  }

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col bg-cream"
      style={{ animation: 'sheetSlideUp 0.28s ease-out' }}
      role="dialog"
      aria-modal="true"
      aria-label={`Statement for ${customerName}`}
    >
      <header className="flex shrink-0 items-center gap-3 border-b border-borderMuted px-4 pb-3 pt-4">
        <button
          type="button"
          onClick={onClose}
          aria-label="Close statement"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-surface shadow-card active:scale-95"
        >
          <ChevronLeftIcon size={18} color="#6E655A" strokeWidth={2.4} />
        </button>
        <div className="min-w-0 flex-1">
          <p className="truncate font-display text-[16px] font-bold leading-tight text-ink">{customerName}</p>
          <p className="mt-[1px] text-[11px] font-semibold text-muted">
            {periodRangeLabel(period, from, to)} · {formatCurrency(amountDue)} due
          </p>
        </div>
      </header>

      <div className="shrink-0 px-4 pt-3">
        <div className="flex flex-wrap gap-[7px]">
          {PERIODS.map((p) => (
            <button
              key={p.value}
              type="button"
              onClick={() => setPeriod(p.value)}
              aria-pressed={period === p.value}
              className={`rounded-[11px] border-[1.5px] px-3 py-2 text-xs font-extrabold transition ${
                period === p.value ? 'border-[#F3C6B2] bg-[#FDE9DE] text-accent' : 'border-borderMuted bg-surface text-muted'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>

        {period === 'custom' && (
          <div className="mt-2 flex items-center gap-2">
            <input
              id="statement-from"
              type="date"
              value={from}
              max={to}
              onChange={(e) => setFrom(e.target.value)}
              aria-label="From date"
              className="h-10 flex-1 rounded-[11px] border-[1.5px] border-borderMuted bg-surface px-[11px] text-xs font-bold text-ink"
            />
            <span className="text-xs font-bold text-subtle">→</span>
            <input
              id="statement-to"
              type="date"
              value={to}
              min={from}
              onChange={(e) => setTo(e.target.value)}
              aria-label="To date"
              className="h-10 flex-1 rounded-[11px] border-[1.5px] border-borderMuted bg-surface px-[11px] text-xs font-bold text-ink"
            />
          </div>
        )}
      </div>

      <div className="min-h-0 flex-1 px-4 py-3">
        <iframe
          title="Statement preview"
          srcDoc={previewHtml}
          className="h-full w-full rounded-[14px] border border-borderMuted bg-white shadow-card"
        />
      </div>

      <div className="flex shrink-0 gap-2 border-t border-borderMuted bg-surface px-4 pb-5 pt-3">
        <ActionButton label="Share" onClick={handleShare} disabled={!pdfBlob} primary busy={building} />
        <ActionButton label="Print" onClick={handlePrint} />
        <ActionButton
          label="Download"
          onClick={handleDownloadPdf}
          disabled={!pdfBlob}
          busy={building}
          icon={<DownloadIcon size={15} color="#1F1813" />}
        />
      </div>
    </div>
  )
}

function ActionButton({
  label,
  onClick,
  disabled = false,
  primary = false,
  busy = false,
  icon,
}: {
  label: string
  onClick: () => void
  disabled?: boolean
  primary?: boolean
  busy?: boolean
  icon?: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`flex flex-1 items-center justify-center gap-1.5 rounded-[14px] py-[13px] text-[13px] font-extrabold transition active:scale-[0.98] disabled:opacity-50 ${
        primary
          ? 'bg-gradient-to-br from-accentSoft to-accent text-white shadow-glow'
          : 'bg-cream text-ink'
      }`}
    >
      {icon}
      {busy && disabled ? 'Preparing…' : label}
    </button>
  )
}
