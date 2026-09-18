export type TemplateName = 'bill_sale' | 'bill_payment' | 'bill_return'

export interface BillContext {
  customerName: string
  billNumber: string
  /** ISO timestamp from bills.created_at */
  createdAt: string
  totalAmount: number
  /** bills.method; null on bills where no method was recorded */
  method: string | null
  /** bills.paid */
  paid: boolean
  /**
   * For sales, qty is cylinders sold and amount is qty * unit price at time
   * of sale (NewSale writes amount: qty * price, so amount / qty recovers
   * the sale price even after the product's current price has changed).
   * empties is the count of empty cylinders collected on that line.
   *
   * For returns, qty is cylinders returned — LogReturn writes the returned
   * count into bill_lines.qty and leaves empties at 0, matching how
   * customer_product_balances computes `returned`.
   */
  lines: { productName: string; qty: number; amount: number; empties: number }[]
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
 * Plain `qty × product name` form, used by the return template (returns
 * have no per-unit price — a returned empty is not a sale).
 * One line, ` • ` separated. WhatsApp rejects template parameters
 * containing newlines or tabs, so any whitespace inside product names is
 * collapsed.
 */
export function formatPlainItems(lines: { productName: string; qty: number }[]): string {
  if (lines.length === 0) return '-'
  return lines.map((l) => `${l.qty} × ${clean(l.productName)}`).join(' • ')
}

/**
 * Delivered items WITH unit price and line total, e.g.
 * `2 × 19kg Commercial @ ₹2150 = ₹4300`. The unit rate is recovered as
 * `amount / qty` (NewSale stores `amount: qty * price`), which reflects the
 * actual price at the time of sale rather than the product's current price.
 * A line with qty 0 omits the `@ rate = total` part rather than dividing by
 * zero.
 */
export function formatDeliveredWithPrices(
  lines: { productName: string; qty: number; amount: number }[],
): string {
  if (lines.length === 0) return '-'
  return lines
    .map((l) => {
      const name = clean(l.productName)
      if (l.qty === 0) return `${l.qty} × ${name}`
      const rate = rupees(l.amount / l.qty)
      const total = rupees(l.amount)
      return `${l.qty} × ${name} @ ₹${rate} = ₹${total}`
    })
    .join(' • ')
}

/**
 * Empties collected, with NO prices — empties are not sold, so a price
 * would be misleading. Lines with no empties on them are omitted entirely;
 * if nothing was collected, the whole thing reads `None`.
 */
export function formatEmptiesCollected(
  lines: { productName: string; qty: number; empties: number }[],
): string {
  const withEmpties = lines.filter((l) => l.empties !== 0)
  if (withEmpties.length === 0) return 'None'
  return withEmpties.map((l) => `${l.empties} × ${clean(l.productName)}`).join(' • ')
}

/**
 * `Paid by Cash` / `Paid by Upi` / `Paid by Vitran` when paid with a
 * recorded method, plain `Paid` when paid with no method recorded, and
 * `Not paid` otherwise.
 */
export function formatPaymentStatus(paid: boolean, method: string | null): string {
  if (!paid) return 'Not paid'
  if (!method) return 'Paid'
  return `Paid by ${titleCase(clean(method))}`
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
        formatDeliveredWithPrices(ctx.lines),
        formatEmptiesCollected(ctx.lines),
        rupees(ctx.totalAmount),
        formatPaymentStatus(ctx.paid, ctx.method),
        String(Math.round(ctx.emptiesOutstanding)),
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
        formatPlainItems(ctx.lines),
        String(Math.round(ctx.emptiesOutstanding)),
        rupees(ctx.balanceDue),
      ]
  }
}
