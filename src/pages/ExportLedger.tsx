import { useState } from 'react'
import { supabase } from '../lib/supabase'

function toCsv(rows: Record<string, unknown>[]) {
  if (rows.length === 0) return ''
  const headers = Object.keys(rows[0])
  const escape = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`
  const lines = [headers.join(',')]
  for (const row of rows) {
    lines.push(headers.map((h) => escape(row[h])).join(','))
  }
  return lines.join('\n')
}

export function ExportLedger() {
  const [exporting, setExporting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleExport() {
    setExporting(true)
    setError(null)
    const { data, error } = await supabase
      .from('activity_feed')
      .select('*')
      .order('created_at', { ascending: false })
    setExporting(false)
    if (error) {
      setError(error.message)
      return
    }
    const csv = toCsv(data ?? [])
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `ledger-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="p-5 pb-10 pt-3">
      <h1 className="mb-2 font-display text-[26px] font-bold tracking-[-0.5px] text-ink">Export ledger</h1>
      <p className="mb-5 text-[13px] font-medium leading-[1.5] text-subtle">
        Download every sale, return, and payment as a CSV file.
      </p>
      <div className="rounded-[20px] bg-surface p-5 shadow-card">
        {error && <p className="mb-4 text-sm font-semibold text-red-600">{error}</p>}
        <button
          onClick={handleExport}
          disabled={exporting}
          className="h-[56px] w-full rounded-[16px] bg-gradient-to-br from-accentSoft to-accent text-[15px] font-bold text-white shadow-glow transition active:scale-[0.99] disabled:opacity-50"
        >
          {exporting ? 'Preparing…' : 'Export CSV'}
        </button>
      </div>
    </div>
  )
}
