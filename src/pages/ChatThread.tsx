import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useChats } from '../hooks/useChats'
import {
  buildThreads, customersByPhone, dayLabel, lastInboundAt, mediaKind, messageText, messagesForPhone, parseBold, replyWindowOpen, timeLabel,
} from '../utils/chat'
import { ChatTicks } from '../components/ChatTicks'
import { InitialsBadge } from '../components/InitialsBadge'
import { ChatMedia } from '../components/ChatMedia'
import { sendBillWhatsApp } from '../lib/whatsapp'
import { ChevronLeftIcon, PhoneIcon } from '../components/icons'

const WALLPAPER =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='60' height='60'%3E%3Ccircle cx='8' cy='8' r='1.4' fill='%23785028' fill-opacity='.07'/%3E%3Ccircle cx='38' cy='34' r='1.4' fill='%23785028' fill-opacity='.07'/%3E%3Cpath d='M46 8l4 4m0-4l-4 4' stroke='%23785028' stroke-opacity='.07' stroke-width='1.2'/%3E%3C/svg%3E\")"
const OUT_BG = '#FDE9DE'

const MAX_TEXT = 2000

export function ChatThread() {
  const { phone = '' } = useParams()
  const navigate = useNavigate()
  const { messages, customers, loading, error, refresh } = useChats()
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const [sendError, setSendError] = useState<string | null>(null)
  const [viewer, setViewer] = useState<string | null>(null)
  const [retrying, setRetrying] = useState<Set<number>>(new Set())
  const bottomRef = useRef<HTMLDivElement>(null)

  const thread = useMemo(() => buildThreads(messages, customers).find((t) => t.phone === phone), [messages, customers, phone])
  const mine = useMemo(() => messagesForPhone(messages, phone), [messages, phone])
  const person = useMemo(() => customersByPhone(customers).get(phone) ?? null, [customers, phone])
  const title = person?.name ?? thread?.name ?? `+${phone}`

  const windowOpen = replyWindowOpen(lastInboundAt(mine))
  const unreadIds = mine.filter((m) => m.direction === 'in' && !m.read_at).map((m) => m.id)

  // Opening a conversation marks the customer's messages as read.
  useEffect(() => {
    if (unreadIds.length === 0) return
    void supabase
      .from('chat_messages')
      .update({ read_at: new Date().toISOString() })
      .in('id', unreadIds)
      .then(() => refresh())
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unreadIds.join(',')])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: 'end' })
  }, [mine.length])

  // Bill messages carry their bill id, so a failed one is re-sent by asking the
  // server to send that bill again. The result lands through realtime.
  function retry(billId: number) {
    setRetrying((r) => new Set(r).add(billId))
    sendBillWhatsApp(billId)
    for (const ms of [3000, 7000]) setTimeout(() => void refresh(), ms)
    setTimeout(
      () => setRetrying((r) => { const n = new Set(r); n.delete(billId); return n }),
      8000,
    )
  }

  async function send() {
    const text = draft.trim()
    if (!text || sending) return
    setSending(true)
    setSendError(null)
    const { data, error: fnError } = await supabase.functions.invoke('send-chat-message', { body: { phone, text } })
    setSending(false)

    if (fnError || data?.error) {
      let code = data?.error as string | undefined
      // A non-2xx response arrives as an error whose body holds the code.
      const ctx = (fnError as { context?: Response } | null)?.context
      if (!code && ctx && typeof ctx.json === 'function') code = (await ctx.json().catch(() => null))?.error
      setSendError(
        code === 'window_closed'
          ? 'The 24-hour reply window has closed. Wait for the customer to message you.'
          : 'Could not send. Check your connection and try again.',
      )
      void refresh()
      return
    }
    setDraft('')
    void refresh()
  }

  let lastDay = ''

  return (
    <div className="flex h-screen flex-col bg-cream">
      <header className="flex shrink-0 items-center gap-3 border-b border-borderMuted px-4 pb-3 pt-4">
        <button
          type="button"
          onClick={() => (window.history.length > 1 ? navigate(-1) : navigate('/commercial/chats'))}
          aria-label="Back to chats"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-surface shadow-card active:scale-95"
        >
          <ChevronLeftIcon size={18} color="#6E655A" strokeWidth={2.4} />
        </button>
        <InitialsBadge name={title.replace(/^\+/, '')} size={38} radius={19} />
        {person ? (
          <Link to={`/commercial/customers/${person.id}`} className="min-w-0 flex-1">
            <p className="truncate font-display text-[16px] font-bold leading-tight text-ink">{title}</p>
            <p className="mt-[1px] truncate text-[11px] font-semibold text-muted">+{phone}</p>
          </Link>
        ) : (
          <div className="min-w-0 flex-1">
            <p className="truncate font-display text-[16px] font-bold leading-tight text-ink">{title}</p>
            <p className="mt-[1px] truncate text-[11px] font-semibold text-muted">
              Not a saved customer{thread?.profileName ? ` · ~${thread.profileName} (name set by the sender)` : ''}
            </p>
          </div>
        )}
        <a
          href={`tel:+${phone}`}
          aria-label="Call"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-surface shadow-card active:scale-95"
        >
          <PhoneIcon size={16} />
        </a>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-[5%] py-2" style={{ backgroundImage: WALLPAPER }}>
        {loading && <p className="py-3 text-center text-muted">Loading…</p>}
        {error && <p className="text-red-600">{error}</p>}
        {!loading && mine.length === 0 && (
          <p className="mx-auto mt-6 max-w-[270px] rounded-[10px] bg-surface px-3 py-2 text-center text-[12.5px] font-semibold text-muted shadow-card">
            No messages in the last 7 days. You can reply once this customer messages you.
          </p>
        )}
        {mine.map((m, i) => {
          const day = dayLabel(m.created_at)
          const showDay = day !== lastDay
          lastDay = day
          const out = m.direction === 'out'
          const first = showDay || mine[i - 1]?.direction !== m.direction
          const failed = out && m.status === 'failed'
          return (
            <div key={m.id}>
              {showDay && (
                <div className="my-3 flex justify-center">
                  <span className="rounded-[8px] bg-surface px-3 py-[5px] text-[11.5px] font-bold uppercase tracking-[0.4px] text-muted shadow-card">
                    {day}
                  </span>
                </div>
              )}
              <div className={`flex flex-col ${out ? 'items-end' : 'items-start'} ${first ? 'mt-[10px]' : 'mt-[2px]'}`}>
                <div
                  className="relative max-w-[88%] px-[10px] pb-[6px] pt-[6px] shadow-card"
                  style={{
                    background: out ? OUT_BG : '#fff',
                    borderRadius: first ? (out ? '10px 0 10px 10px' : '0 10px 10px 10px') : '10px',
                  }}
                >
                  {first && (
                    <span
                      aria-hidden="true"
                      className="absolute top-0 h-[13px] w-[8px]"
                      style={{
                        background: out ? OUT_BG : '#fff',
                        [out ? 'right' : 'left']: '-8px',
                        clipPath: out ? 'polygon(0 0, 0 100%, 100% 0)' : 'polygon(100% 0, 100% 100%, 0 0)',
                      }}
                    />
                  )}
                  <div className="relative text-[14px] leading-[19px] text-ink">
                    {mediaKind(m) && <ChatMedia message={m} onOpenImage={setViewer} />}
                    <span className={`whitespace-pre-wrap break-words ${m.body ? '' : 'italic text-muted'}`}>
                      {m.body
                        ? parseBold(m.body).map((r, k) =>
                            r.bold ? <strong key={k} className="font-bold">{r.text}</strong> : <span key={k}>{r.text}</span>,
                          )
                        : messageText(m)}
                    </span>
                    <span className="inline-block" style={{ width: out ? 68 : 50 }} aria-hidden="true" />
                    <span className="absolute bottom-[-1px] right-0 flex items-center gap-[3px] text-[10.5px] font-semibold text-subtle">
                      {timeLabel(m.created_at)}
                      {out && <ChatTicks status={m.status} size={15} />}
                    </span>
                  </div>
                </div>
                {failed && (
                  <div className="mt-1 flex items-center gap-2 text-[12px] font-semibold text-[#C23B22]">
                    <span>Not delivered</span>
                    {m.bill_id != null && (
                      <button
                        type="button"
                        onClick={() => retry(m.bill_id!)}
                        disabled={retrying.has(m.bill_id)}
                        className="rounded-full bg-accent px-3 py-[4px] text-[12px] font-bold text-white transition active:scale-95 disabled:opacity-60"
                      >
                        {retrying.has(m.bill_id) ? 'Retrying…' : 'Retry'}
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
          )
        })}
        <div ref={bottomRef} />
      </div>

      <div className="shrink-0 border-t border-borderMuted bg-surface px-4 pb-5 pt-3">
        {!windowOpen ? (
          <p className="rounded-[12px] bg-cream px-3 py-[10px] text-center text-[12.5px] font-semibold text-muted">
            {mine.length === 0
              ? 'You can reply once the customer messages you.'
              : 'The 24-hour reply window has closed. You can reply after the customer messages you.'}
          </p>
        ) : (
          <>
            {sendError && <p className="mb-2 text-[12px] font-semibold text-[#C23B22]">{sendError}</p>}
            <div className="flex items-end gap-2">
              <textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value.slice(0, MAX_TEXT))}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault()
                    void send()
                  }
                }}
                rows={1}
                placeholder="Message"
                aria-label="Message"
                className="max-h-[110px] min-h-[44px] flex-1 resize-none rounded-[22px] border-[1.5px] border-borderMuted bg-cream px-4 py-[11px] text-[14px] font-semibold text-ink outline-none focus:border-accent"
              />
              <button
                type="button"
                onClick={() => void send()}
                disabled={sending || draft.trim() === ''}
                aria-label="Send"
                className="flex h-[44px] w-[44px] shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-accentSoft to-accent shadow-glow transition active:scale-95 disabled:opacity-50"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="#fff" aria-hidden="true">
                  <path d="M3.4 20.4 21 12 3.4 3.6 3.4 10l12.6 2-12.6 2z" />
                </svg>
              </button>
            </div>
          </>
        )}
      </div>
      {viewer && (
        <div
          role="dialog"
          aria-label="Photo"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4"
          onClick={() => setViewer(null)}
        >
          <img src={viewer} alt="Photo from customer" className="max-h-full max-w-full rounded-[8px] object-contain" />
          <button
            type="button"
            aria-label="Close photo"
            className="absolute right-4 top-4 flex h-10 w-10 items-center justify-center rounded-full bg-white/15 text-[22px] font-bold leading-none text-white"
          >
            ×
          </button>
        </div>
      )}
    </div>
  )
}
