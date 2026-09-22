import { createClient } from 'jsr:@supabase/supabase-js@2'
import { normalizeIndianPhone } from './phone.ts'
import { buildTemplateParams, templateForBillType, type BillContext } from './templates.ts'
import { updateWithRetry } from './retryUpdate.ts'

const GRAPH_VERSION = 'v25.0'
const META_TIMEOUT_MS = 15_000
const STALE_CLAIM_MS = 5 * 60 * 1000
const UNIQUE_VIOLATION = '23505'

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

// resolve() no longer always hands the handler a bare Outcome to insert.
// The claim path (see claimSend) writes and updates its own whatsapp_sends
// row directly, since the whole point of claiming before sending is to
// hold exactly one row per bill through the send — a second insert from
// the handler afterwards would either violate the unique index or create a
// stray duplicate.
interface ResolveResult {
  outcome: Outcome
  // true: resolve() already wrote (and, for the claim path, attempted to
  // update) the row itself — the handler must NOT insert another one.
  alreadyRecorded: boolean
  // Whether the row genuinely reflects `outcome` right now. Only meaningful
  // when alreadyRecorded is true; the handler computes its own value from
  // its insert's result otherwise.
  recorded: boolean
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
    .select('id, bill_number, type, total_amount, method, paid, created_at, customer_id')
    .eq('id', billId)
    .single()

  if (billError || !bill) {
    return json({ error: 'bill_not_found' }, 404)
  }

  const result = await resolve(db, bill)

  let recorded = result.recorded
  if (!result.alreadyRecorded) {
    // supabase-js does not throw on a failed insert — it resolves with
    // { error }. A send that truly went out must still be reported as such
    // even if we failed to record it, but the send history is now out of
    // sync (e.g. it would re-show as "never sent" and Retry could send a
    // duplicate).
    const { error: insertError } = await db.from('whatsapp_sends').insert({
      bill_id: billId,
      status: result.outcome.status,
      reason: result.outcome.reason,
      message_id: result.outcome.message_id,
      template: result.outcome.template,
    })
    recorded = !insertError
  }

  // The client (sendBillWhatsApp) fires this and ignores the response body —
  // `recorded` is not for it. It is a diagnostic for whoever reads the
  // function's invocation logs: `status: 'sent', recorded: false` is the one
  // state where a real message went to a customer but whatsapp_sends does
  // not reflect it, which needs a manual look, not just a retry.
  return json({ ...result.outcome, recorded }, 200)
})

async function resolve(db: any, bill: any): Promise<ResolveResult> {
  const template = templateForBillType(bill.type)
  if (!template) {
    // bill.type (e.g. 'opening') is not a template name — the column is
    // not null, so record a placeholder instead of a misleading value.
    return { outcome: skip('not_applicable', 'none'), alreadyRecorded: false, recorded: false }
  }

  // Cheap pre-check: avoids pointless work (customer/phone lookups, the
  // Meta call) on the common repeat case. This is an optimisation only —
  // the claim further below, backed by the partial unique index
  // whatsapp_sends_one_live_per_bill, is the real guarantee against a
  // double-send. This check alone cannot close that race: two concurrent
  // callers can both see no 'sent' row before either has written anything.
  const { data: existingSent, error: existingSentError } = await db
    .from('whatsapp_sends')
    .select('id')
    .eq('bill_id', bill.id)
    .eq('status', 'sent')
    .limit(1)

  if (existingSentError) {
    return { outcome: failedDataError(template), alreadyRecorded: false, recorded: false }
  }
  if (existingSent && existingSent.length > 0) {
    return { outcome: skip('already_sent', template), alreadyRecorded: false, recorded: false }
  }

  // Guards below never take a claim — a skip is not an in-flight send.
  if (!bill.customer_id) {
    return { outcome: skip('no_customer', template), alreadyRecorded: false, recorded: false }
  }

  const { data: customer, error: customerError } = await db
    .from('customers')
    .select('id, name, phone, whatsapp_enabled')
    .eq('id', bill.customer_id)
    .single()

  // A failed query must not read the same as a genuinely missing customer —
  // 'no_customer' looks like a permanent, deliberate skip to whoever reads
  // it, so a transient DB error hiding behind it would never get retried and
  // the customer would silently never receive their bill.
  if (customerError) return { outcome: failedDataError(template), alreadyRecorded: false, recorded: false }
  if (!customer) return { outcome: skip('no_customer', template), alreadyRecorded: false, recorded: false }
  if (!customer.whatsapp_enabled) return { outcome: skip('disabled', template), alreadyRecorded: false, recorded: false }
  if (!customer.phone) return { outcome: skip('no_phone', template), alreadyRecorded: false, recorded: false }

  const to = normalizeIndianPhone(customer.phone)
  if (!to) return { outcome: skip('invalid_phone', template), alreadyRecorded: false, recorded: false }

  const { data: lines, error: linesError } = await db
    .from('bill_lines')
    .select('qty, amount, empties, products(name)')
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
    return { outcome: failedDataError(template), alreadyRecorded: false, recorded: false }
  }

  const emptiesOutstanding = (productBalances ?? [])
    .reduce((sum: number, r: any) => sum + Number(r.empties_outstanding ?? 0), 0)

  const ctx: BillContext = {
    customerName: customer.name,
    billNumber: bill.bill_number,
    createdAt: bill.created_at,
    totalAmount: Number(bill.total_amount ?? 0),
    method: bill.method,
    paid: Boolean(bill.paid),
    lines: (lines ?? []).map((l: any) => ({
      productName: l.products?.name ?? 'Item',
      qty: Number(l.qty ?? 0),
      amount: Number(l.amount ?? 0),
      empties: Number(l.empties ?? 0),
    })),
    balanceDue: Number(balance?.amount_due ?? 0),
    emptiesOutstanding,
  }

  // CLAIM: take a 'pending' row for this bill before calling Meta. See
  // claimSend for how the partial unique index makes this the actual
  // guarantee against a double-send, not just the pre-check above.
  const claim = await claimSend(db, bill.id, template)
  if (claim.claimId === null) {
    return { outcome: claim.outcome!, alreadyRecorded: false, recorded: false }
  }

  const sendOutcome = await send(to, template, buildTemplateParams(template, ctx))

  // Update the row we already claimed rather than inserting a new one — the
  // claim and the final result must be the same row, or the unique index
  // would reject a second insert while the pending row still sat there.
  //
  // Retried up to 3 times: if this update never lands, the row stays
  // 'pending' even though the message was already delivered, which reads as
  // a stale claim after STALE_CLAIM_MS — Retry would then take it over and
  // send a duplicate. Retrying here closes the transient-DB-error case. It
  // does NOT close a process teardown between the Meta call above and this
  // update actually committing; that residual window needs a reconciliation
  // pass and is intentionally not handled here.
  const recorded = await updateWithRetry(() =>
    db
      .from('whatsapp_sends')
      .update({
        status: sendOutcome.status,
        reason: sendOutcome.reason,
        message_id: sendOutcome.message_id,
      })
      .eq('id', claim.claimId),
  )

  return { outcome: sendOutcome, alreadyRecorded: true, recorded }
}

interface ClaimResult {
  // Row id to update once the send finishes, or null if no send should be
  // attempted — in which case `outcome` is already the final result.
  claimId: number | null
  outcome: Outcome | null
}

async function claimSend(db: any, billId: number, template: string): Promise<ClaimResult> {
  const { data: claimRow, error: claimError } = await db
    .from('whatsapp_sends')
    .insert({ bill_id: billId, status: 'pending', reason: null, message_id: null, template })
    .select('id')
    .single()

  if (!claimError && claimRow) {
    return { claimId: claimRow.id, outcome: null }
  }

  if (claimError?.code !== UNIQUE_VIOLATION) {
    // A real DB error, not a conflict with another claim — no row was
    // written, nothing to send.
    return { claimId: null, outcome: failedDataError(template) }
  }

  // Conflict: whatsapp_sends_one_live_per_bill already has a 'pending' or
  // 'sent' row for this bill. It might be a live in-flight send, an
  // already-succeeded one, or an abandoned claim left by a process that
  // crashed between claiming and recording its result.
  const { data: rows, error: readError } = await db
    .from('whatsapp_sends')
    .select('id, status, created_at')
    .eq('bill_id', billId)
    .in('status', ['pending', 'sent'])
    .limit(1)

  if (readError || !rows || rows.length === 0) {
    // Couldn't read the conflicting row — fail closed rather than guess
    // whether it's safe to send.
    return { claimId: null, outcome: failedDataError(template) }
  }

  const existing = rows[0]
  const staleThresholdIso = new Date(Date.now() - STALE_CLAIM_MS).toISOString()
  const looksStale = existing.status === 'pending' &&
    new Date(existing.created_at).getTime() < Date.now() - STALE_CLAIM_MS

  if (!looksStale) {
    // Either already sent, or a pending claim that is still fresh (a
    // concurrent request is genuinely in flight right now). Do not send
    // again — the Meta call times out at 15s, so nothing genuinely live
    // can ever be mistaken for stale at the 5-minute mark.
    return { claimId: null, outcome: skip('already_sent', template) }
  }

  // Take the abandoned claim over. Repeating the staleness condition in
  // the UPDATE's own WHERE clause (not just checking it above in
  // application code) is what makes the takeover atomic: if two requests
  // race to take over the same abandoned row, only the first to commit
  // still finds created_at older than the threshold — by the time the
  // second one's UPDATE runs against the row, the first has already
  // refreshed created_at, so the second matches zero rows instead of also
  // believing it won the takeover.
  const { data: takenOver, error: takeoverError } = await db
    .from('whatsapp_sends')
    .update({ created_at: new Date().toISOString() })
    .eq('id', existing.id)
    .eq('status', 'pending')
    .lt('created_at', staleThresholdIso)
    .select('id')

  if (takeoverError) {
    return { claimId: null, outcome: failedDataError(template) }
  }
  if (!takenOver || takenOver.length === 0) {
    // Someone else's send resolved (or took the row over) between our read
    // and this update — it's no longer an abandoned claim. Do not touch it,
    // do not send.
    return { claimId: null, outcome: skip('already_sent', template) }
  }

  return { claimId: existing.id, outcome: null }
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

function failedDataError(template: string): Outcome {
  return { status: 'failed', reason: 'data_error', message_id: null, template }
}

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders },
  })
}
