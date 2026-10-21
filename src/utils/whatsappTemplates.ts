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
        String(Math.round(ctx.emptiesOutstanding)),
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

// Meta counts header variables separately from body variables. The approved
// bill_sale and bill_payment templates each carry one — "{{1}} New bill" and
// "{{1}}  Payment Received" — where the variable holds the leading icon.
// Sending only body parameters makes Meta reject the whole message with
// #132000 "Number of parameters does not match the expected number of params".
// bill_return's header is static text and takes none.
export function buildHeaderParams(template: TemplateName): string[] {
  switch (template) {
    case 'bill_sale':
      return ['\u{1F9FE}']
    case 'bill_payment':
      return ['\u2705']
    case 'bill_return':
      return []
  }
}

/**
 * The bill message as the customer sees it, for the in-app chat. The approved
 * template text lives in Meta, not here, so this mirrors it from the same
 * parameters that are sent, keeping the chat and the customer's phone in step.
 * `*word*` marks bold, exactly as WhatsApp does; the chat renders it.
 */
export function renderChatBody(template: TemplateName, ctx: BillContext): string {
  const p = buildTemplateParams(template, ctx)
  const icon = buildHeaderParams(template)[0]
  const rule = '\u2500'.repeat(14)

  switch (template) {
    case 'bill_sale':
      return [
        `${icon} *New Bill*`,
        `Namaste *${p[0]}* \u{1F64F}`,
        '',
        `*Bill No:* ${p[1]}  |  *Date:* ${p[2]}`,
        '',
        '*Delivered*',
        p[3],
        '',
        '*Empties Collected Today*',
        p[4],
        '',
        rule,
        `*Total Bill Amount:* \u20B9${p[5]}`,
        `*Payment Status:* ${p[6]}`,
        '',
        `*Empty Cylinders Pending:* ${p[7]}`,
        `*Total Account Balance Due:* \u20B9${p[8]}`,
        '',
        'Contact us for any corrections.',
      ].join('\n')
    case 'bill_payment':
      return [
        `${icon} *Payment Received*`,
        `Namaste *${p[0]}* \u{1F64F}`,
        '',
        `*Amount:* \u20B9${p[1]}  |  *Date:* ${p[2]}`,
        `*Method:* ${p[3]}`,
        '',
        rule,
        `*Empty Cylinders Pending:* ${p[5]}`,
        `*Total Account Balance Due:* \u20B9${p[4]}`,
        '',
        'Contact us for any corrections.',
      ].join('\n')
    case 'bill_return':
      return [
        '*Empties Returned*',
        `Namaste *${p[0]}* \u{1F64F}`,
        '',
        `*Date:* ${p[1]}`,
        '',
        '*Returned*',
        p[2],
        '',
        rule,
        `*Empty Cylinders Pending:* ${p[3]}`,
        `*Total Account Balance Due:* \u20B9${p[4]}`,
        '',
        'Contact us for any corrections.',
      ].join('\n')
  }
}
