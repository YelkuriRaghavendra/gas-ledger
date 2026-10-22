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
const GRAPH_VERSION = 'v25.0'
const MAX_MEDIA_BYTES = 8 * 1024 * 1024
const MAX_MEDIA_PER_CALL = 10
const MEDIA_TIMEOUT_MS = 10_000
// Meta serves media from its own CDN. The bearer token is sent only to these,
// so a hostile `url` in a response cannot make us leak it to another host.
const MEDIA_HOST_SUFFIXES = ['.fbsbx.com', '.fbcdn.net', '.whatsapp.net', '.facebook.com']

const EXT_BY_MIME: Record<string, string> = {
  'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp',
  'audio/ogg': 'ogg', 'audio/mpeg': 'mp3', 'audio/mp4': 'm4a', 'audio/aac': 'aac', 'audio/amr': 'amr',
}

function isMetaHost(url: URL): boolean {
  return url.protocol === 'https:' && MEDIA_HOST_SUFFIXES.some((suffix) => url.hostname.endsWith(suffix))
}

// Meta returns a short-lived URL for a media id; the file is then fetched from
// it with the same token. Returns null on any failure: a message without its
// picture is still worth keeping, and Meta must still get its 200.
async function downloadMedia(token: string, id: string): Promise<{ bytes: Uint8Array; mime: string } | null> {
  try {
    const headers = { Authorization: `Bearer ${token}` }
    const infoRes = await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/${id}`, {
      headers,
      signal: AbortSignal.timeout(MEDIA_TIMEOUT_MS),
    })
    if (!infoRes.ok) return null
    const info = await infoRes.json()
    if (typeof info?.url !== 'string') return null
    if (Number(info.file_size) > MAX_MEDIA_BYTES) return null
    const url = new URL(info.url)
    if (!isMetaHost(url)) return null

    const fileRes = await fetch(url, { headers, signal: AbortSignal.timeout(MEDIA_TIMEOUT_MS), redirect: 'error' })
    if (!fileRes.ok) return null
    const bytes = new Uint8Array(await fileRes.arrayBuffer())
    if (bytes.byteLength === 0 || bytes.byteLength > MAX_MEDIA_BYTES) return null
    const mime = String(info.mime_type ?? fileRes.headers.get('content-type') ?? '').split(';')[0].trim()
    return { bytes, mime }
  } catch {
    return null
  }
}

// Deletes messages past retention. A message's file is removed first, and the
// row is kept if that fails, so a file can never be orphaned.
async function pruneChat(supabase: any) {
  const cutoff = new Date(Date.now() - CHAT_RETENTION_MS).toISOString()
  const { data: old } = await supabase.from('chat_messages').select('id, media_path').lt('created_at', cutoff).limit(200)
  if (!old || old.length === 0) return
  const paths = old.map((r: any) => r.media_path).filter(Boolean)
  if (paths.length > 0) {
    const { error } = await supabase.storage.from('chat-media').remove(paths)
    if (error) {
      console.error('whatsapp-status: could not remove expired media', error.message)
      return
    }
  }
  await supabase.from('chat_messages').delete().in('id', old.map((r: any) => r.id))
}

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
    const batch = inbound.slice(0, MAX_MESSAGES)

    // A Meta retry of a delivery we already stored must not download again.
    const { data: known } = await supabase
      .from('chat_messages')
      .select('wa_message_id')
      .in('wa_message_id', batch.map((m) => m.waMessageId))
    const seen = new Set((known ?? []).map((r: any) => r.wa_message_id as string))

    const token = Deno.env.get('WHATSAPP_TOKEN')
    const stored = new Map<string, { path: string; mime: string }>()
    const todo = batch.filter((m) => m.media && !seen.has(m.waMessageId) && token).slice(0, MAX_MEDIA_PER_CALL)
    await Promise.all(
      todo.map(async (m) => {
        const file = await downloadMedia(token!, m.media!.id)
        if (!file) return
        const mime = file.mime || m.media!.mime
        const safeId = m.waMessageId.replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 80)
        const path = `${m.phone}/${safeId}.${EXT_BY_MIME[mime] ?? 'bin'}`
        const { error } = await supabase.storage.from('chat-media').upload(path, file.bytes, { contentType: mime, upsert: true })
        if (error) console.error('whatsapp-status: could not store media', error.message)
        else stored.set(m.waMessageId, { path, mime })
      }),
    )

    // upsert on the wamid makes a Meta retry of the same delivery a no-op.
    // A DB error is logged and swallowed: a non-200 only makes Meta resend
    // the identical payload, which would fail the same way.
    const { error } = await supabase.from('chat_messages').upsert(
      batch.map((m) => ({
        wa_message_id: m.waMessageId,
        phone: m.phone,
        direction: 'in',
        msg_type: m.type,
        body: m.body,
        profile_name: m.profileName,
        created_at: m.at,
        media_path: stored.get(m.waMessageId)?.path ?? null,
        media_mime: stored.get(m.waMessageId)?.mime ?? null,
      })),
      { onConflict: 'wa_message_id', ignoreDuplicates: true },
    )
    if (error) console.error('whatsapp-status: could not store inbound message', error.message)
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

  // Retention backstop (and the only pruner for messages that carry a file).
  try {
    await pruneChat(supabase)
  } catch (e) {
    console.error('whatsapp-status: prune failed', e instanceof Error ? e.message : e)
  }

  // Always 200 once the signature checks out. Meta retries anything else, and
  // a retry will not change the outcome of a status we have already applied.
  return new Response('ok', { status: 200 })
})
