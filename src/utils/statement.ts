import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import { formatCurrency, formatDate } from './format'
import type { Transaction } from '../types/db'

export type HistoryEntry = Transaction & { balanceAfter: number; productName: string | null }

export interface HistoryGroup {
  key: string
  label: string
  entries: HistoryEntry[]
  sales: number
  returns: number
  collected: number
}

export function historyTitle(t: Transaction, productName?: string | null) {
  if (t.type === 'sale') return productName ? `${t.qty} × ${productName} sold` : `${t.qty} cylinders sold`
  if (t.type === 'return') return productName ? `${t.qty} × ${productName} returned` : `${t.qty} empties returned`
  return 'Payment received'
}

export function esc(s: string) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

export function generatePdfHtml(
  customerName: string,
  phone: string | null,
  address: string | null,
  amountDue: number,
  groups: HistoryGroup[],
  agency: { name: string; phone: string | null; address: string | null } | null,
) {
  const rows = groups
    .flatMap((g) =>
      g.entries.map(
        (t, i) => {
          const bg = i % 2 === 0 ? '#FAFAF7' : '#fff'
          const typeLabel = t.type === 'sale' ? 'Sale' : t.type === 'return' ? 'Return' : 'Payment'
          const typeBg = t.type === 'sale' ? '#FFF3ED' : t.type === 'return' ? '#EDF7F1' : '#EDF2F7'
          const typeColor = t.type === 'sale' ? '#C24B1A' : t.type === 'return' ? '#1D7A4A' : '#3B6EA5'
          return `<tr style="background:${bg}">
            <td style="padding:10px 12px;font-size:12px;color:#6B5E50">${esc(formatDate(t.created_at))}</td>
            <td style="padding:10px 12px;text-align:center">
              <span style="display:inline-block;background:${typeBg};color:${typeColor};font-size:10px;font-weight:700;padding:2px 8px;border-radius:4px;letter-spacing:0.3px">${typeLabel}</span>
            </td>
            <td style="padding:10px 12px;font-size:13px;font-weight:600;color:#1F1813">${esc(historyTitle(t, t.productName))}</td>
            <td style="padding:10px 12px;text-align:right;font-size:13px;font-weight:600;color:#1F1813">${t.type !== 'return' ? formatCurrency(t.amount) : '—'}</td>
            <td style="padding:10px 12px;text-align:right;font-size:13px;font-weight:600;color:#6B5E50">${formatCurrency(t.balanceAfter)}</td>
          </tr>`
        },
      ),
    )
    .join('')

  const now = new Date()
  const dateStr = now.toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })

  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${esc(customerName)} — Statement</title>
<style>
  *{margin:0;padding:0;box-sizing:border-box}
  body{font-family:-apple-system,'Segoe UI',system-ui,sans-serif;max-width:640px;margin:0 auto;padding:32px 24px;color:#1F1813;background:#fff}
  @media print{body{padding:16px}@page{margin:12mm 10mm}}
</style></head><body>
<div style="text-align:center;margin-bottom:20px;padding-bottom:18px;border-bottom:2px solid #1F1813">
  <div style="font-size:20px;font-weight:800;color:#1F1813;letter-spacing:-0.3px">${esc(agency?.name || 'Cylinder Tracker')}</div>
  ${agency?.phone ? `<div style="font-size:13px;color:#6B5E50;margin-top:4px">${esc(agency.phone)}</div>` : ''}
  ${agency?.address ? `<div style="font-size:13px;color:#6B5E50;margin-top:2px">${esc(agency.address)}</div>` : ''}
</div>

<div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:20px">
  <div>
    <div style="font-size:18px;font-weight:700;color:#1F1813">${esc(customerName)}</div>
    ${phone ? `<div style="font-size:13px;color:#6B5E50;margin-top:3px">${esc(phone)}</div>` : ''}
    ${address ? `<div style="font-size:13px;color:#6B5E50;margin-top:2px">${esc(address)}</div>` : ''}
  </div>
  <div style="text-align:right">
    <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;color:#8B7E6E">Amount due</div>
    <div style="font-size:26px;font-weight:800;color:#E4571B;line-height:1.1">${formatCurrency(amountDue)}</div>
  </div>
</div>

<table style="width:100%;border-collapse:collapse">
  <thead>
    <tr style="border-bottom:2px solid #E0D8CC">
      <th style="padding:8px 12px;text-align:left;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;color:#8B7E6E">Date</th>
      <th style="padding:8px 12px;text-align:center;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;color:#8B7E6E">Type</th>
      <th style="padding:8px 12px;text-align:left;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;color:#8B7E6E">Description</th>
      <th style="padding:8px 12px;text-align:right;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;color:#8B7E6E">Amount</th>
      <th style="padding:8px 12px;text-align:right;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;color:#8B7E6E">Balance</th>
    </tr>
  </thead>
  <tbody>${rows}</tbody>
</table>

<div style="margin-top:24px;padding-top:16px;border-top:1px solid #E0D8CC;text-align:center">
  <span style="font-size:11px;color:#B0A898">${dateStr}</span>
</div>
</body></html>`
}

export function generatePdfBlob(
  customerName: string,
  phone: string | null,
  address: string | null,
  amountDue: number,
  groups: HistoryGroup[],
  agency: { name: string; phone: string | null; address: string | null } | null,
): Blob {
  const doc = new jsPDF({ unit: 'pt', format: 'a4' })
  const pageWidth = doc.internal.pageSize.getWidth()
  const marginX = 40
  let y = 50

  // Header block: agency name, phone, address, divider.
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(16)
  doc.setTextColor(31, 24, 19) // #1F1813
  doc.text(agency?.name || 'Cylinder Tracker', marginX, y)
  y += 18

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10)
  doc.setTextColor(107, 94, 80) // #6B5E50
  if (agency?.phone) {
    doc.text(agency.phone, marginX, y)
    y += 14
  }
  if (agency?.address) {
    doc.text(agency.address, marginX, y)
    y += 14
  }

  y += 6
  doc.setDrawColor(31, 24, 19)
  doc.setLineWidth(1)
  doc.line(marginX, y, pageWidth - marginX, y)
  y += 22

  // Customer block (left) + amount due (right).
  const customerTop = y
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(13)
  doc.setTextColor(31, 24, 19)
  doc.text(customerName, marginX, y)
  y += 16

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10)
  doc.setTextColor(107, 94, 80)
  if (phone) {
    doc.text(phone, marginX, y)
    y += 14
  }
  if (address) {
    doc.text(address, marginX, y)
    y += 14
  }

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(9)
  doc.setTextColor(139, 126, 110) // #8B7E6E
  doc.text('AMOUNT DUE', pageWidth - marginX, customerTop, { align: 'right' })
  doc.setFontSize(20)
  doc.setTextColor(228, 87, 27) // #E4571B
  doc.text(formatCurrency(amountDue), pageWidth - marginX, customerTop + 20, { align: 'right' })

  y = Math.max(y, customerTop + 20) + 20

  // Transaction table.
  const rows = groups.flatMap((g) =>
    g.entries.map((t) => {
      const typeLabel = t.type === 'sale' ? 'Sale' : t.type === 'return' ? 'Return' : 'Payment'
      return [
        formatDate(t.created_at),
        typeLabel,
        historyTitle(t, t.productName),
        t.type !== 'return' ? formatCurrency(t.amount) : '—',
        formatCurrency(t.balanceAfter),
      ]
    }),
  )

  autoTable(doc, {
    startY: y,
    head: [['Date', 'Type', 'Description', 'Amount', 'Balance']],
    body: rows,
    theme: 'striped',
    margin: { left: marginX, right: marginX },
    styles: { fontSize: 9, textColor: [31, 24, 19], cellPadding: 6 },
    headStyles: { fillColor: [31, 24, 19], textColor: [255, 255, 255], fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [250, 250, 247] },
    columnStyles: {
      3: { halign: 'right' },
      4: { halign: 'right' },
    },
  })

  // Footer: generated date.
  const now = new Date()
  const dateStr = now.toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })
  const pageHeight = doc.internal.pageSize.getHeight()
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.setTextColor(176, 168, 152) // #B0A898
  doc.text(dateStr, pageWidth / 2, pageHeight - 30, { align: 'center' })

  return doc.output('blob')
}

export function statementFilename(customerName: string): string {
  return `${customerName.replace(/[^\w]+/g, '-')}-statement.pdf`
}

export type StatementPeriod = 'this-month' | 'last-month' | 'all' | 'custom'

export function filterGroupsByPeriod(
  groups: HistoryGroup[],
  period: StatementPeriod,
  from?: string,
  to?: string,
): HistoryGroup[] {
  if (period === 'all') return groups

  let start: Date
  let end: Date

  if (period === 'this-month') {
    const now = new Date()
    start = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0)
    end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999)
  } else if (period === 'last-month') {
    const now = new Date()
    start = new Date(now.getFullYear(), now.getMonth() - 1, 1, 0, 0, 0, 0)
    end = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999)
  } else {
    // custom
    if (!from || !to) return groups
    const [fy, fm, fd] = from.split('-').map(Number)
    const [ty, tm, td] = to.split('-').map(Number)
    start = new Date(fy, fm - 1, fd, 0, 0, 0, 0)
    end = new Date(ty, tm - 1, td, 23, 59, 59, 999)
  }

  const startMs = start.getTime()
  const endMs = end.getTime()

  return groups
    .map((g) => {
      const entries = g.entries.filter((e) => {
        const ms = new Date(e.created_at).getTime()
        return ms >= startMs && ms <= endMs
      })
      let sales = 0
      let returns = 0
      let collected = 0
      for (const t of entries) {
        if (t.type === 'sale') sales += 1
        if (t.type === 'return') returns += 1
        if (t.type === 'payment') collected += t.amount
        if (t.type === 'sale' && t.paid) collected += t.amount
      }
      return { ...g, entries, sales, returns, collected }
    })
    .filter((g) => g.entries.length > 0)
}
