// Receives Meta's webhook: delivery-status callbacks for chat messages (bill
// notifications are chat messages too) and inbound customer messages for the
// in-app chat.
//
// Meta reports delivery exactly once, to a webhook, and discards it if nobody
// is listening. There is no endpoint that returns a message's status later, so
// without this function a bill that was accepted by Meta and never delivered is
// indistinguishable from one that arrived.
//
// DEPLOYMENT: this endpoint is called by Meta, which cannot present a Supabase
// JWT, so it must be deployed with --no-verify-jwt. Authenticity is established
// instead by the X-Hub-Signature-256 HMAC, which is verified on every POST.

import { createClient } from 'jsr:@supabase/supabase-js@2'
import { parseStatusPayload, outranks, type DeliveryStatus } from './statuses.ts'
import { parseInboundMessages } from './messages.ts'

// Meta's status payloads are small; a legitimate one never approaches this.
const MAX_BODY_BYTES = 256 * 1024
// One SELECT and one UPDATE per status, so an enormous batch would run the
// function out of wall clock and make Meta retry the whole payload forever.
const MAX_STATUSES = 200
const MAX_MESSAGES = 200
// Chat messages are kept for a week; see migration 022.
const CHAT_RETENTION_MS = 7 * 24 * 60 * 60 * 1000

const VERIFY_TOKEN = Deno.env.get('WHATSAPP_VERIFY_TOKEN')
const APP_SECRET = Deno.env.get('META_APP_SECRET')

function hex(buffer: ArrayBuffer): string {
  return [...new Uint8Array(buffer)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

// Constant-time comparison. A length-dependent early return would leak how much
// of a forged signature was correct, so compare every byte regardless.
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

async function signatureValid(raw: Uint8Array, header: string | null): Promise<boolean> {
  if (!APP_SECRET || !header?.startsWith('sha256=')) return false
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(APP_SECRET),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const mac = await crypto.subtle.sign('HMAC', key, raw)
  return safeEqual(`sha256=${hex(mac)}`, header)
}

Deno.serve(async (req: Request) => {
  const url = new URL(req.url)

  // Meta's one-time subscription handshake.
  if (req.method === 'GET') {
    const mode = url.searchParams.get('hub.mode')
    const token = url.searchParams.get('hub.verify_token')
    const challenge = url.searchParams.get('hub.challenge')
    if (mode === 'subscribe' && VERIFY_TOKEN && token && safeEqual(token, VERIFY_TOKEN) && challenge) {
      return new Response(challenge, { status: 200 })
    }
    return new Response('forbidden', { status: 403 })
  }

  if (req.method !== 'POST') return new Response('method not allowed', { status: 405 })

  // Reject an oversized body before buffering it. Anyone who learns this URL
  // can POST without a secret, and reading an unbounded body into memory and
  // running HMAC over it would be free work for them and paid work for us.
  const declared = Number(req.headers.get('content-length'))
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) {
    return new Response('payload too large', { status: 413 })
  }

  const rawBytes = new Uint8Array(await req.arrayBuffer())
  if (rawBytes.byteLength > MAX_BODY_BYTES) {
    return new Response('payload too large', { status: 413 })
  }

  // Without this check anyone who learns the URL could post fabricated
  // 'delivered' rows and the bill history would lie.
  if (!(await signatureValid(rawBytes, req.headers.get('x-hub-signature-256')))) {
    // Logged without the body or the header: a rejected signature is worth
    // noticing (someone is probing) but its contents are not ours to trust.
    console.warn('whatsapp-status: rejected a request with an invalid signature')
    return new Response('invalid signature', { status: 401 })
  }

  let updates: ReturnType<typeof parseStatusPayload>
  let inbound: ReturnType<typeof parseInboundMessages>
  try {
    const parsed = JSON.parse(new TextDecoder().decode(rawBytes))
    updates = parseStatusPayload(parsed)
    inbound = parseInboundMessages(parsed)
  } catch {
    // Unparseable body. Meta retries non-200 responses indefinitely, and a
    // retry cannot fix malformed JSON, so acknowledge and drop it.
    return new Response('ok', { status: 200 })
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  if (inbound.length > 0) {
    // upsert on the wamid makes a Meta retry of the same delivery a no-op.
    // A DB error is logged and swallowed: a non-200 only makes Meta resend
    // the identical payload, which would fail the same way.
    const { error } = await supabase.from('chat_messages').upsert(
      inbound.slice(0, MAX_MESSAGES).map((m) => ({
        wa_message_id: m.waMessageId,
        phone: m.phone,
        direction: 'in',
        msg_type: m.type,
        body: m.body,
        profile_name: m.profileName,
        created_at: m.at,
      })),
      { onConflict: 'wa_message_id', ignoreDuplicates: true },
    )
    if (error) console.error('whatsapp-status: could not store inbound message', error.message)

    // Backstop for the daily pg_cron prune.
    await supabase
      .from('chat_messages')
      .delete()
      .lt('created_at', new Date(Date.now() - CHAT_RETENTION_MS).toISOString())
  }

  if (updates.length > 0) {
    const batch = updates.slice(0, MAX_STATUSES)

    // Outbound chat messages report delivery through the same callback.
    const { data: chatRows } = await supabase
      .from('chat_messages')
      .select('id, wa_message_id, status')
      .in('wa_message_id', batch.map((u) => u.messageId))
    const chatByWamid = new Map<string, { id: number; status: DeliveryStatus | null }>()
    for (const r of chatRows ?? []) chatByWamid.set(r.wa_message_id as string, { id: r.id as number, status: r.status })
    for (const u of batch) {
      const chat = chatByWamid.get(u.messageId)
      if (chat && outranks(u.status, chat.status)) {
        await supabase.from('chat_messages').update({ status: u.status }).eq('id', chat.id)
      }
    }
  }

  // Always 200 once the signature checks out. Meta retries anything else, and
  // a retry will not change the outcome of a status we have already applied.
  return new Response('ok', { status: 200 })
})
