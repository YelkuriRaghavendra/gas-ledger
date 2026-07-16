import { ReactNode, useEffect, useState } from 'react'
import { BottomSheet } from './BottomSheet'
import { DownloadIcon, ChevronLeftIcon } from './icons'
import { formatCurrency } from '../utils/format'
import { generatePdfHtml, generatePdfBlob, statementFilename, filterGroupsByPeriod } from '../utils/statement'
import type { HistoryGroup, StatementPeriod } from '../utils/statement'

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

const PERIOD_LABELS: Record<StatementPeriod, string> = {
  'this-month': 'this month',
  'last-month': 'last month',
  all: 'all time',
  custom: 'the selected period',
}

export function StatementDialog({ open, onClose, customerName, amountDue, groups, customer, agency }: StatementDialogProps) {
  const now = new Date()
  const [period, setPeriod] = useState<StatementPeriod>('this-month')
  const [from, setFrom] = useState(toDateInputValue(new Date(now.getFullYear(), now.getMonth(), 1)))
  const [to, setTo] = useState(toDateInputValue(now))
  // The PDF is rasterised from HTML (async), so build it ahead of time and
  // keep it ready. This also lets the WhatsApp share fire synchronously inside
  // the user's tap — navigator.share needs an active user gesture, which an
  // await would consume.
  const [pdfBlob, setPdfBlob] = useState<Blob | null>(null)
  const [building, setBuilding] = useState(false)

  // Refresh the custom-range defaults each time the dialog opens so they don't
  // go stale if the component stays mounted across a month boundary.
  useEffect(() => {
    if (open) {
      const today = new Date()
      setFrom(toDateInputValue(new Date(today.getFullYear(), today.getMonth(), 1)))
      setTo(toDateInputValue(today))
    }
  }, [open])

  // Pre-build the PDF whenever the dialog opens or the period changes.
  useEffect(() => {
    if (!open) {
      setPdfBlob(null)
      return
    }
    let cancelled = false
    setBuilding(true)
    setPdfBlob(null)
    const filtered = filterGroupsByPeriod(groups, period, from, to)
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
  }, [open, period, from, to, amountDue, customerName])

  function openPrintWindow() {
    const filtered = filterGroupsByPeriod(groups, period, from, to)
    const html = generatePdfHtml(customerName, customer.phone, customer.address, amountDue, filtered, agency)
    const blob = new Blob([html], { type: 'text/html' })
    const url = URL.createObjectURL(blob)
    const win = window.open(url, '_blank')
    if (win) setTimeout(() => { win.print(); URL.revokeObjectURL(url) }, 600)
    else URL.revokeObjectURL(url)
  }

  function summaryText() {
    const business = agency?.name || 'Statement'
    return `${business} — ${customerName}: ${formatCurrency(amountDue)} due (${PERIOD_LABELS[period]})`
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

  async function handleWhatsApp() {
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
    openPrintWindow()
  }

  return (
    <BottomSheet open={open} onClose={onClose}>
      <h2 className="pr-8 font-display text-[18px] font-bold text-ink">Share statement</h2>
      <p className="mb-[14px] mt-[2px] text-[11.5px] font-semibold text-muted">
        {customerName} · {formatCurrency(amountDue)} due
      </p>

      <p className="mb-[7px] text-[10px] font-extrabold uppercase tracking-[0.5px] text-subtle">Period</p>
      <div className="mb-1.5 flex flex-wrap gap-[7px]">
        {PERIODS.map((p) => (
          <button
            key={p.value}
            type="button"
            onClick={() => setPeriod(p.value)}
            className={`rounded-[11px] border-[1.5px] px-3 py-2 text-xs font-extrabold transition ${
              period === p.value ? 'border-[#F3C6B2] bg-[#FDE9DE] text-accent' : 'border-borderMuted bg-cream text-muted'
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>

      {period === 'custom' && (
        <div className="mb-1 mt-2 flex items-center gap-2">
          <input
            type="date"
            value={from}
            max={to}
            onChange={(e) => setFrom(e.target.value)}
            className="h-10 flex-1 rounded-[11px] border-[1.5px] border-borderMuted bg-cream px-[11px] text-xs font-bold text-ink"
          />
          <span className="text-xs font-bold text-subtle">→</span>
          <input
            type="date"
            value={to}
            min={from}
            onChange={(e) => setTo(e.target.value)}
            className="h-10 flex-1 rounded-[11px] border-[1.5px] border-borderMuted bg-cream px-[11px] text-xs font-bold text-ink"
          />
        </div>
      )}

      <div className="mt-2">
        <OptionRow
          tint="#FDECE3"
          icon={<DownloadIcon size={17} color="#E4571B" />}
          title="Download PDF"
          subtitle={building ? 'Preparing PDF…' : 'Save the statement as a PDF'}
          onClick={handleDownloadPdf}
          disabled={!pdfBlob}
        />
        <OptionRow
          tint="#E4F5EA"
          icon={<WhatsAppGlyph />}
          title="Share on WhatsApp"
          subtitle={building ? 'Preparing PDF…' : 'Attach the PDF (on phone)'}
          onClick={handleWhatsApp}
          disabled={!pdfBlob}
        />
        <OptionRow
          tint="#EAF0F7"
          icon={<PrinterGlyph />}
          title="Print"
          subtitle="To a connected printer"
          onClick={handlePrint}
        />
      </div>
    </BottomSheet>
  )
}

function OptionRow({
  icon,
  tint,
  title,
  subtitle,
  onClick,
  disabled = false,
}: {
  icon: ReactNode
  tint: string
  title: string
  subtitle: string
  onClick: () => void
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="flex w-full items-center gap-3 border-t border-[#F1E9DB] py-[13px] text-left transition first:border-t-0 disabled:opacity-50"
    >
      <div
        className="flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-[12px]"
        style={{ backgroundColor: tint }}
      >
        {icon}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-extrabold text-ink">{title}</p>
        <p className="mt-[1px] text-[10.5px] font-semibold text-subtle">{subtitle}</p>
      </div>
      <span className="shrink-0 rotate-180">
        <ChevronLeftIcon size={16} color="#C7BCAB" strokeWidth={2.2} />
      </span>
    </button>
  )
}

function WhatsAppGlyph() {
  return (
    <svg width={17} height={17} viewBox="0 0 24 24" fill="#25A05A">
      <path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.45 1.32 4.95L2 22l5.28-1.39a9.9 9.9 0 0 0 4.76 1.21h.01c5.46 0 9.9-4.45 9.9-9.91C21.95 6.45 17.5 2 12.04 2Zm5.8 14.03c-.24.68-1.4 1.3-1.93 1.34-.5.05-1.02.24-3.43-.72-2.9-1.16-4.76-4.12-4.9-4.31-.14-.19-1.17-1.56-1.17-2.98s.74-2.11 1-2.4c.26-.29.57-.36.76-.36.19 0 .38 0 .55.01.18.01.42-.07.65.5.24.58.81 2 .88 2.15.07.14.12.31.02.5-.1.19-.15.31-.3.48-.14.17-.3.38-.43.51-.14.14-.29.29-.13.57.17.29.75 1.24 1.62 2.01 1.11.99 2.05 1.3 2.34 1.44.29.14.46.12.63-.07.17-.19.72-.84.92-1.13.19-.29.38-.24.63-.14.26.09 1.65.78 1.94.92.29.14.48.22.55.34.07.12.07.71-.17 1.39Z" />
    </svg>
  )
}

function PrinterGlyph() {
  return (
    <svg width={17} height={17} viewBox="0 0 24 24" fill="none" stroke="#3B6EA5" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <polyline points="6 9 6 2 18 2 18 9" />
      <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
      <rect x="6" y="14" width="12" height="8" />
    </svg>
  )
}
