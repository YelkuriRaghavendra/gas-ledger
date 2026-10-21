// Sends a free-text WhatsApp reply from the in-app chat.
//
// Meta allows free text only within 24 hours of the customer's last message
// (the customer-service window). That is enforced here, on the server, from the
// stored inbound messages, so a stale or tampered client cannot bypass it.
//
// Replies always go to the number that wrote to us, so the bill-notification
// test override (WHATSAPP_TEST_RECIPIENT) deliberately does not apply here.

import { createClient } from 'jsr:@supabase/supabase-js@2'

const GRAPH_VERSION = 'v25.0'
const META_TIMEOUT_MS = 15_000
const WINDOW_MS = 24 * 60 * 60 * 1000
const MAX_TEXT = 2000

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405)

  // Only a signed-in app user may send from the business number.
  const anon = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
  })
  const { data: userData, error: userError } = await anon.auth.getUser()
  if (userError || !userData?.user) return json({ error: 'unauthorized' }, 401)

  let phone: string
  let text: string
  try {
    const body = await req.json()
    phone = String(body?.phone ?? '')
    text = String(body?.text ?? '').trim()
  } catch {
    return json({ error: 'bad_request' }, 400)
  }
  if (!/^\d{8,15}$/.test(phone) || text.length === 0 || text.length > MAX_TEXT) {
    return json({ error: 'bad_request' }, 400)
  }

  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

  const { data: lastIn } = await db
    .from('chat_messages')
    .select('created_at')
    .eq('phone', phone)
    .eq('direction', 'in')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!lastIn || Date.now() - new Date(lastIn.created_at as string).getTime() > WINDOW_MS) {
    return json({ error: 'window_closed' }, 409)
  }

  const phoneNumberId = Deno.env.get('WHATSAPP_PHONE_NUMBER_ID')
  const token = Deno.env.get('WHATSAPP_TOKEN')
  if (!phoneNumberId || !token) return json({ error: 'missing_credentials' }, 500)

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), META_TIMEOUT_MS)
  try {
    const res = await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/${phoneNumberId}/messages`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to: phone,
        type: 'text',
        text: { body: text, preview_url: false },
      }),
      signal: controller.signal,
    })
    const payload = await res.json().catch(() => ({}))
    if (!res.ok) {
      // Meta's error text only; never log the request, which carries the token.
      return json({ error: 'send_failed', detail: String(payload?.error?.message ?? `http_${res.status}`).slice(0, 300) }, 502)
    }

    const wamid = payload?.messages?.[0]?.id ?? null
    const { error: insertError } = await db.from('chat_messages').insert({
      wa_message_id: wamid,
      phone,
      direction: 'out',
      msg_type: 'text',
      body: text,
      status: 'sent',
      created_by: userData.user.id,
    })
    // The message is already with Meta; a failed log must not report a failed send.
    if (insertError) console.error('send-chat-message: sent but could not store', insertError.message)

    return json({ ok: true })
  } catch (e) {
    const aborted = e instanceof DOMException && e.name === 'AbortError'
    return json({ error: aborted ? 'timeout' : 'send_failed' }, 502)
  } finally {
    clearTimeout(timer)
  }
})
