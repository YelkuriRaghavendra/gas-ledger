import { createClient } from 'jsr:@supabase/supabase-js@2'
import { normalizeIndianPhone } from './phone.ts'
import { buildTemplateParams, templateForBillType, type BillContext } from './templates.ts'

const GRAPH_VERSION = 'v25.0'
const META_TIMEOUT_MS = 15_000

// supabase.functions.invoke() sends Authorization + Content-Type, which makes
// this a non-simple cross-origin request — the browser preflights it with
// OPTIONS before the real POST. Without these headers on every response
// (including error paths) the gateway never sees the actual request.
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

interface Outcome {
  status: 'sent' | 'failed' | 'skipped'
  reason: string | null
  message_id: string | null
  template: string
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (req.method !== 'POST') {
    return json({ error: 'method_not_allowed' }, 405)
  }

  // The caller must be a signed-in app user. Without this check anyone who
  // discovers the URL could trigger sends on the business's number.
  const authHeader = req.headers.get('Authorization') ?? ''
  const anon = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authHeader } } },
  )
  const { data: userData, error: userError } = await anon.auth.getUser()
  if (userError || !userData?.user) {
    return json({ error: 'unauthorized' }, 401)
  }

  let billId: number
  try {
    const body = await req.json()
    billId = Number(body?.bill_id)
    if (!Number.isFinite(billId) || billId <= 0) throw new Error('bad id')
  } catch {
    return json({ error: 'bad_request' }, 400)
  }

  // Service role: needed to insert into whatsapp_sends, which has no
  // authenticated insert policy by design.
  const db = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  const { data: bill, error: billError } = await db
    .from('bills')
    .select('id, bill_number, type, total_amount, method, created_at, customer_id')
    .eq('id', billId)
    .single()

  if (billError || !bill) {
    return json({ error: 'bill_not_found' }, 404)
  }

  const outcome = await resolve(db, bill)
  // supabase-js does not throw on a failed insert — it resolves with
  // { error }. A send that truly went out must still be reported as such
  // even if we failed to record it, but the caller needs to know the send
  // history is now out of sync (e.g. to avoid re-showing "never sent").
  const { error: insertError } = await db.from('whatsapp_sends').insert({
    bill_id: billId,
    status: outcome.status,
    reason: outcome.reason,
    message_id: outcome.message_id,
    template: outcome.template,
  })

  return json({ ...outcome, recorded: !insertError }, 200)
})

async function resolve(db: any, bill: any): Promise<Outcome> {
  const template = templateForBillType(bill.type)
  if (!template) {
    // bill.type (e.g. 'opening') is not a template name — the column is
    // not null, so record a placeholder instead of a misleading value.
    return skip('not_applicable', 'none')
  }

  // Idempotency: an authenticated caller can invoke this repeatedly for the
  // same bill. Retries of a FAILED or SKIPPED attempt must still go through
  // (a later retry-button task depends on that), but a bill already marked
  // 'sent' must never be sent again — that would message a real customer
  // twice. If we can't even tell whether it was already sent, don't guess:
  // fail closed rather than risk a duplicate.
  const { data: existingSent, error: existingSentError } = await db
    .from('whatsapp_sends')
    .select('id')
    .eq('bill_id', bill.id)
    .eq('status', 'sent')
    .limit(1)

  if (existingSentError) {
    return { status: 'failed', reason: 'data_error', message_id: null, template }
  }
  if (existingSent && existingSent.length > 0) {
    return skip('already_sent', template)
  }

  if (!bill.customer_id) {
    return skip('no_customer', template)
  }

  const { data: customer } = await db
    .from('customers')
    .select('id, name, phone, whatsapp_enabled')
    .eq('id', bill.customer_id)
    .single()

  if (!customer) return skip('no_customer', template)
  if (!customer.whatsapp_enabled) return skip('disabled', template)
  if (!customer.phone) return skip('no_phone', template)

  const to = normalizeIndianPhone(customer.phone)
  if (!to) return skip('invalid_phone', template)

  const { data: lines, error: linesError } = await db
    .from('bill_lines')
    .select('qty, products(name)')
    .eq('bill_id', bill.id)

  const { data: balance, error: balanceError } = await db
    .from('customer_balances')
    .select('amount_due')
    .eq('id', customer.id)
    .single()

  const { data: productBalances, error: productBalancesError } = await db
    .from('customer_product_balances')
    .select('empties_outstanding')
    .eq('customer_id', customer.id)

  // A query error here must never fall through to the ?? 0 defaults below —
  // that would silently tell a real customer their balance is zero. A bill
  // that fails to send is recoverable; a bill that sends the wrong number
  // is not.
  if (linesError || balanceError || productBalancesError) {
    return { status: 'failed', reason: 'data_error', message_id: null, template }
  }

  const emptiesOutstanding = (productBalances ?? [])
    .reduce((sum: number, r: any) => sum + Number(r.empties_outstanding ?? 0), 0)

  const ctx: BillContext = {
    customerName: customer.name,
    billNumber: bill.bill_number,
    createdAt: bill.created_at,
    totalAmount: Number(bill.total_amount ?? 0),
    method: bill.method,
    lines: (lines ?? []).map((l: any) => ({
      productName: l.products?.name ?? 'Item',
      qty: Number(l.qty ?? 0),
    })),
    balanceDue: Number(balance?.amount_due ?? 0),
    emptiesOutstanding,
  }

  return await send(to, template, buildTemplateParams(template, ctx))
}

async function send(to: string, template: string, params: string[]): Promise<Outcome> {
  const phoneNumberId = Deno.env.get('WHATSAPP_PHONE_NUMBER_ID')
  const token = Deno.env.get('WHATSAPP_TOKEN')
  if (!phoneNumberId || !token) {
    return { status: 'failed', reason: 'missing_credentials', message_id: null, template }
  }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), META_TIMEOUT_MS)

  try {
    const res = await fetch(
      `https://graph.facebook.com/${GRAPH_VERSION}/${phoneNumberId}/messages`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          to,
          type: 'template',
          template: {
            name: template,
            language: { code: 'en' },
            components: [{
              type: 'body',
              parameters: params.map((text) => ({ type: 'text', text })),
            }],
          },
        }),
        signal: controller.signal,
      },
    )

    const payload = await res.json().catch(() => ({}))

    if (!res.ok) {
      // Meta's error text only. Never log the request headers — they carry the token.
      const reason = payload?.error?.message ?? `http_${res.status}`
      return { status: 'failed', reason: String(reason).slice(0, 500), message_id: null, template }
    }

    return {
      status: 'sent',
      reason: null,
      message_id: payload?.messages?.[0]?.id ?? null,
      template,
    }
  } catch (err) {
    const reason = err instanceof Error && err.name === 'AbortError' ? 'timeout' : 'network_error'
    return { status: 'failed', reason, message_id: null, template }
  } finally {
    clearTimeout(timer)
  }
}

function skip(reason: string, template: string): Outcome {
  return { status: 'skipped', reason, message_id: null, template }
}

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders },
  })
}
