import { useEffect, useMemo, useState } from 'react'
import {
  HistoryGroup,
  StatementPeriod,
  StatementTypeFilter,
  filterGroupsByPeriod,
  filterGroupsByType,
  generatePdfBlob,
  generatePdfHtml,
  periodAmountDue,
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

const TYPES: { value: StatementTypeFilter; label: string; dot: string }[] = [
  { value: 'all', label: 'All', dot: '#1F1813' },
  { value: 'sale', label: 'Sales', dot: '#C24B1A' },
  { value: 'return', label: 'Returns', dot: '#1D7A4A' },
  { value: 'payment', label: 'Payments', dot: '#3B6EA5' },
]

function pad(n: number) {
  return String(n).padStart(2, '0')
}

function toDateInputValue(d: Date) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

export function StatementDialog({ open, onClose, customerName, amountDue: totalDue, groups, customer, agency }: StatementDialogProps) {
  const now = new Date()
  const [period, setPeriod] = useState<StatementPeriod>('this-month')
  const [typeFilter, setTypeFilter] = useState<StatementTypeFilter>('all')
  const [from, setFrom] = useState(toDateInputValue(new Date(now.getFullYear(), now.getMonth(), 1)))
  const [to, setTo] = useState(toDateInputValue(now))
  // The PDF is rasterised from HTML (async), so build it ahead of time and keep
  // it ready. This also lets the share fire synchronously inside the user's tap
  // — navigator.share needs an active user gesture, which an await would consume.
  // Off by default: the statement shows the customer's total due. Ticking it
  // swaps in the due raised within the selected period.
  const [periodDueOnly, setPeriodDueOnly] = useState(false)
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
      setPeriodDueOnly(false)
      setTypeFilter('all')
    }
  }, [open])

  const periodFiltered = useMemo(
    () => filterGroupsByPeriod(groups, period, from, to),
    [groups, period, from, to],
  )

  // Amount due is computed from every entry in the period, so hiding a type
  // from the list never changes what the customer owes.
  const amountDue = useMemo(
    () => periodDueOnly ? periodAmountDue(periodFiltered, period, totalDue) : totalDue,
    [periodFiltered, period, totalDue, periodDueOnly],
  )

  const typeCounts = useMemo(() => {
    const c: Record<string, number> = { all: 0, sale: 0, return: 0, payment: 0 }
    for (const g of periodFiltered)
      for (const e of g.entries) { c.all += 1; c[e.type] = (c[e.type] ?? 0) + 1 }
    return c
  }, [periodFiltered])

  const filtered = useMemo(
    () => filterGroupsByType(periodFiltered, typeFilter),
    [periodFiltered, typeFilter],
  )

  // The preview renders the same markup generatePdfBlob rasterises, so what is
  // on screen cannot drift from what gets shared, printed or downloaded.
  const previewHtml = useMemo(
    () => generatePdfHtml(customerName, customer.phone, customer.address, amountDue, filtered, agency, !(periodDueOnly && period !== 'all')),
    [customerName, customer.phone, customer.address, amountDue, filtered, agency, period, periodDueOnly],
  )

  useEffect(() => {
    if (!open) {
      setPdfBlob(null)
      return
    }
    let cancelled = false
    setBuilding(true)
    setPdfBlob(null)
    generatePdfBlob(customerName, customer.phone, customer.address, amountDue, filtered, agency, !(periodDueOnly && period !== 'all'))
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
  }, [open, filtered, amountDue, customerName, period, periodDueOnly])

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
      <header className="flex shrink-0 items-center gap-3 px-4 pb-3 pt-4">
        <button
          type="button"
          onClick={onClose}
          aria-label="Close statement"
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-surface shadow-card active:scale-95"
        >
          <ChevronLeftIcon size={18} color="#6E655A" strokeWidth={2.4} />
        </button>
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-extrabold uppercase tracking-[0.08em] text-subtle">Statement</p>
          <p className="truncate font-display text-[18px] font-bold leading-tight text-ink">{customerName}</p>
        </div>
      </header>

      <div className="shrink-0 px-4">
        <div className="rounded-[18px] bg-surface p-3 shadow-card">
          {/* Period — segmented control */}
          <div role="group" aria-label="Period" className="flex rounded-[12px] bg-cream p-[3px]">
            {PERIODS.map((p) => (
              <button
                key={p.value}
                type="button"
                onClick={() => setPeriod(p.value)}
                aria-pressed={period === p.value}
                className={`flex-1 whitespace-nowrap rounded-[10px] px-1 py-[9px] text-[11.5px] font-extrabold transition ${
                  period === p.value ? 'bg-surface text-ink shadow-card' : 'text-muted'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>

          {period === 'custom' ? (
            <div className="mt-2.5 flex items-end gap-2">
              <label className="flex-1">
                <span className="mb-1 block text-[10px] font-extrabold uppercase tracking-[0.08em] text-subtle">From</span>
                <input
                  id="statement-from"
                  type="date"
                  value={from}
                  max={to}
                  onChange={(e) => setFrom(e.target.value)}
                  aria-label="From date"
                  className="h-10 w-full rounded-[11px] border-[1.5px] border-borderMuted bg-cream px-[11px] text-xs font-bold text-ink"
                />
              </label>
              <label className="flex-1">
                <span className="mb-1 block text-[10px] font-extrabold uppercase tracking-[0.08em] text-subtle">To</span>
                <input
                  id="statement-to"
                  type="date"
                  value={to}
                  min={from}
                  onChange={(e) => setTo(e.target.value)}
                  aria-label="To date"
                  className="h-10 w-full rounded-[11px] border-[1.5px] border-borderMuted bg-cream px-[11px] text-xs font-bold text-ink"
                />
              </label>
            </div>
          ) : (
            <p className="mt-2 px-1 text-[11px] font-semibold text-muted">{periodRangeLabel(period, from, to)}</p>
          )}

          <div className="my-3 h-px bg-borderMuted" />

          {/* Type — chips with a colour key and live counts */}
          <div role="group" aria-label="Entry type" className="grid grid-cols-4 gap-[6px]">
            {TYPES.map((t) => {
              const active = typeFilter === t.value
              return (
                <button
                  key={t.value}
                  type="button"
                  onClick={() => setTypeFilter(t.value)}
                  aria-pressed={active}
                  className={`flex flex-col items-center gap-[1px] rounded-[12px] border-[1.5px] px-1 py-[7px] text-[11.5px] font-extrabold leading-tight transition ${
                    active ? 'border-ink bg-ink text-white' : 'border-borderMuted bg-surface text-muted'
                  }`}
                >
                  {t.label}
                  <span className={`text-[11px] font-bold ${active ? 'text-white/70' : ''}`} style={active ? undefined : { color: t.dot }}>{typeCounts[t.value]}</span>
                </button>
              )
            })}
          </div>

          {period !== 'all' && (
            <button
              type="button"
              role="switch"
              aria-checked={periodDueOnly}
              onClick={() => setPeriodDueOnly(!periodDueOnly)}
              className="mt-3 flex w-full items-center justify-between gap-3 text-left"
            >
              <span>
                <span className="block text-xs font-extrabold text-ink">Due for this period only</span>
                <span className="block text-[11px] font-semibold text-muted">Leave out balance carried from earlier</span>
              </span>
              <span className={`relative h-[22px] w-[38px] shrink-0 rounded-full transition ${periodDueOnly ? 'bg-accent' : 'bg-borderMuted'}`}>
                <span
                  className="absolute top-[3px] h-4 w-4 rounded-full bg-white shadow transition-all"
                  style={{ left: periodDueOnly ? 19 : 3 }}
                />
              </span>
            </button>
          )}
        </div>
      </div>

      <div className="min-h-0 flex-1 px-4 py-3">
        <iframe
          title="Statement preview"
          srcDoc={previewHtml}
          className="h-full w-full rounded-[14px] border border-borderMuted bg-white shadow-card"
        />
      </div>

      <div className="flex shrink-0 gap-2 rounded-t-[22px] bg-surface px-4 pb-5 pt-3 shadow-float">
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
