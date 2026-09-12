export type TemplateName = 'bill_sale' | 'bill_payment' | 'bill_return'

export interface BillContext {
  customerName: string
  billNumber: string
  /** ISO timestamp from bills.created_at */
  createdAt: string
  totalAmount: number
  /** bills.method; null on bills where no method was recorded */
  method: string | null
  /**
   * For sales, qty is cylinders sold. For returns, qty is cylinders returned —
   * LogReturn writes the returned count into bill_lines.qty and leaves
   * empties at 0, matching how customer_product_balances computes `returned`.
   */
  lines: { productName: string; qty: number }[]
  balanceDue: number
  emptiesOutstanding: number
}

export function templateForBillType(type: string): TemplateName | null {
  switch (type) {
    case 'sale':
      return 'bill_sale'
    case 'payment':
      return 'bill_payment'
    case 'return':
      return 'bill_return'
    default:
      // 'opening' and anything unrecognised must never send.
      return null
  }
}

/** DD-MM-YYYY in IST, regardless of where the function runs. */
export function formatBillDate(iso: string): string {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Kolkata',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).formatToParts(new Date(iso))
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? ''
  return `${get('day')}-${get('month')}-${get('year')}`
}

/**
 * One line, comma separated. WhatsApp rejects template parameters containing
 * newlines or tabs, so any whitespace inside product names is collapsed.
 */
export function formatItems(lines: { productName: string; qty: number }[]): string {
  if (lines.length === 0) return '-'
  return lines.map((l) => `${l.qty} × ${clean(l.productName)}`).join(', ')
}

function clean(value: string): string {
  return value.replace(/\s+/g, ' ').trim()
}

function rupees(amount: number): string {
  return String(Math.round(amount))
}

function titleCase(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1).toLowerCase()
}

export function buildTemplateParams(template: TemplateName, ctx: BillContext): string[] {
  const name = clean(ctx.customerName)
  const date = formatBillDate(ctx.createdAt)

  switch (template) {
    case 'bill_sale':
      return [
        name,
        clean(ctx.billNumber),
        date,
        formatItems(ctx.lines),
        rupees(ctx.totalAmount),
        rupees(ctx.balanceDue),
      ]
    case 'bill_payment':
      return [
        name,
        rupees(ctx.totalAmount),
        date,
        titleCase(clean(ctx.method ?? 'cash')),
        rupees(ctx.balanceDue),
      ]
    case 'bill_return':
      return [
        name,
        date,
        formatItems(ctx.lines),
        String(Math.round(ctx.emptiesOutstanding)),
      ]
  }
}
