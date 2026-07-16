import { jsPDF } from 'jspdf'
import html2canvas from 'html2canvas'
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
            <td style="padding:10px 12px;vertical-align:middle;font-size:12px;color:#6B5E50">${esc(formatDate(t.created_at))}</td>
            <td style="padding:10px 12px;vertical-align:middle;text-align:center">
              <span style="display:inline-block;background:${typeBg};color:${typeColor};font-size:10px;font-weight:700;line-height:18px;height:18px;padding:0 8px;border-radius:4px;letter-spacing:0.3px;vertical-align:middle">${typeLabel}</span>
            </td>
            <td style="padding:10px 12px;vertical-align:middle;font-size:13px;font-weight:600;color:#1F1813">${esc(historyTitle(t, t.productName))}</td>
            <td style="padding:10px 12px;vertical-align:middle;text-align:right;font-size:13px;font-weight:600;color:#1F1813">${t.type !== 'return' ? formatCurrency(t.amount) : '—'}</td>
            <td style="padding:10px 12px;vertical-align:middle;text-align:right;font-size:13px;font-weight:600;color:#6B5E50">${formatCurrency(t.balanceAfter)}</td>
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

// Build the PDF from the SAME HTML used for Print, so Download and Share
// are visually identical to the printed statement. The HTML is laid out
// off-screen at 640px (its max-width), rasterised with html2canvas, then
// paged onto A4. Async because rasterising waits for layout.
export async function generatePdfBlob(
  customerName: string,
  phone: string | null,
  address: string | null,
  amountDue: number,
  groups: HistoryGroup[],
  agency: { name: string; phone: string | null; address: string | null } | null,
): Promise<Blob> {
  const html = generatePdfHtml(customerName, phone, address, amountDue, groups, agency)

  const iframe = document.createElement('iframe')
  iframe.style.position = 'fixed'
  iframe.style.left = '-10000px'
  iframe.style.top = '0'
  iframe.style.width = '640px'
  iframe.style.border = '0'
  document.body.appendChild(iframe)

  try {
    const idoc = iframe.contentDocument
    if (!idoc) throw new Error('Could not create statement frame')
    idoc.open()
    idoc.write(html)
    idoc.close()

    // Let layout settle before rasterising.
    await new Promise((resolve) => setTimeout(resolve, 80))

    const body = idoc.body
    const canvas = await html2canvas(body, {
      scale: 2,
      backgroundColor: '#ffffff',
      windowWidth: 640,
      width: 640,
      height: body.scrollHeight,
    })

    const doc = new jsPDF({ unit: 'pt', format: 'a4' })
    const pageW = doc.internal.pageSize.getWidth()
    const pageH = doc.internal.pageSize.getHeight()
    const imgW = pageW
    const imgH = (canvas.height / canvas.width) * imgW
    const imgData = canvas.toDataURL('image/jpeg', 0.95)

    // Slice the tall image across A4 pages.
    let heightLeft = imgH
    let position = 0
    doc.addImage(imgData, 'JPEG', 0, position, imgW, imgH)
    heightLeft -= pageH
    while (heightLeft > 0) {
      position -= pageH
      doc.addPage()
      doc.addImage(imgData, 'JPEG', 0, position, imgW, imgH)
      heightLeft -= pageH
    }

    return doc.output('blob')
  } finally {
    document.body.removeChild(iframe)
  }
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
