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
    <div className="p-4">
      <h1 className="mb-4 text-xl font-bold text-ink">Export ledger</h1>
      <p className="mb-4 text-sm text-muted">Download every sale, return, and payment as a CSV file.</p>
      {error && <p className="mb-4 text-sm text-red-600">{error}</p>}
      <button
        onClick={handleExport}
        disabled={exporting}
        className="w-full rounded-lg bg-accent py-3 font-semibold text-white disabled:opacity-50"
      >
        {exporting ? 'Preparing…' : 'Export CSV'}
      </button>
    </div>
  )
}
