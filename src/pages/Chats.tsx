import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useChats } from '../hooks/useChats'
import { buildThreads, lastInboundAt, messagesForPhone, previewLine, replyWindowOpen, threadStamp } from '../utils/chat'
import { ChatTicks } from '../components/ChatTicks'
import { InitialsBadge } from '../components/InitialsBadge'
import { ChevronLeftIcon, SearchIcon, XIcon } from '../components/icons'

type Filter = 'all' | 'unread'

export function Chats() {
  const navigate = useNavigate()
  const { messages, customers, loading, error } = useChats()
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<Filter>('all')

  const threads = useMemo(() => buildThreads(messages, customers), [messages, customers])
  const unreadThreads = threads.filter((t) => t.unread > 0).length

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase()
    return threads.filter((t) => {
      if (filter === 'unread' && t.unread === 0) return false
      return !q || t.name.toLowerCase().includes(q) || t.phone.includes(q.replace(/\D/g, '') || '\u0000')
    })
  }, [threads, search, filter])

  const chip = (active: boolean) =>
    `shrink-0 rounded-full px-3.5 py-1.5 text-xs font-bold transition active:scale-95 ${
      active ? 'bg-ink text-white shadow-card' : 'border border-borderMuted bg-surface text-muted'
    }`

  return (
    <div className="px-4 pb-[110px] pt-4">
      <header className="mb-4 flex items-center gap-3">
        <button
          type="button"
          onClick={() => navigate('/commercial')}
          aria-label="Back to home"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-surface shadow-card active:scale-95"
        >
          <ChevronLeftIcon size={18} color="#6E655A" strokeWidth={2.4} />
        </button>
        <div className="min-w-0">
          <h1 className="font-display text-[24px] font-bold leading-none tracking-[-0.5px] text-ink">Chats</h1>
          <p className="mt-[3px] text-[11.5px] font-semibold text-subtle">Messages are kept for 7 days</p>
        </div>
      </header>

      <div className="relative mb-3">
        <span className="pointer-events-none absolute left-[15px] top-1/2 -translate-y-1/2">
          <SearchIcon size={18} />
        </span>
        <input
          type="search"
          placeholder="Search name or phone"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="h-[48px] w-full rounded-[16px] border-[1.5px] border-borderMuted bg-surface pl-11 pr-9 font-semibold text-ink shadow-card"
        />
        {search && (
          <button onClick={() => setSearch('')} aria-label="Clear search" className="absolute right-3 top-1/2 -translate-y-1/2 text-subtle">
            <XIcon size={16} />
          </button>
        )}
      </div>

      <div className="mb-4 flex items-center gap-2">
        <button onClick={() => setFilter('all')} className={chip(filter === 'all')}>All ({threads.length})</button>
        <button onClick={() => setFilter('unread')} className={chip(filter === 'unread')}>Unread ({unreadThreads})</button>
      </div>

      {loading && <p className="text-muted">Loading…</p>}
      {error && <p className="text-red-600">{error}</p>}

      {!loading && !error && visible.length === 0 && (
        <div className="mt-8 rounded-[18px] bg-surface px-5 py-8 text-center shadow-card">
          <p className="font-display text-[16px] font-bold text-ink">
            {threads.length === 0 ? 'No chats yet' : 'No chats match'}
          </p>
          <p className="mt-1 text-[13px] font-semibold text-muted">
            {threads.length === 0
              ? 'Bills you send and customer replies show up here.'
              : 'Try another name or clear the filter.'}
          </p>
        </div>
      )}

      <ul className="flex flex-col gap-2">
        {visible.map((t) => {
          const open = replyWindowOpen(lastInboundAt(messagesForPhone(messages, t.phone)))
          return (
            <li key={t.phone}>
              <Link
                to={`/commercial/chats/${t.phone}`}
                className="flex items-center gap-3 rounded-[18px] bg-surface p-3 shadow-card transition active:scale-[0.99]"
              >
                <InitialsBadge name={t.name.replace(/^\+/, '')} size={46} radius={15} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-2">
                    <p className={`truncate text-[15px] text-ink ${t.unread > 0 ? 'font-extrabold' : 'font-bold'}`}>{t.name}</p>
                    <p className={`shrink-0 text-[11.5px] font-semibold ${t.unread > 0 ? 'text-accent' : 'text-subtle'}`}>
                      {threadStamp(t.last.created_at)}
                    </p>
                  </div>
                  <div className="mt-[3px] flex items-center justify-between gap-2">
                    <p className={`flex min-w-0 items-center gap-1 text-[13px] ${t.unread > 0 ? 'font-bold text-ink' : 'font-semibold text-muted'}`}>
                      {t.last.direction === 'out' && <ChatTicks status={t.last.status} size={15} />}
                      <span className="truncate">{previewLine(t.last)}</span>
                    </p>
                    {t.unread > 0 && (
                      <span className="flex h-[19px] min-w-[19px] shrink-0 items-center justify-center rounded-full bg-accent px-[5px] text-[11px] font-bold text-white">
                        {t.unread}
                      </span>
                    )}
                  </div>
                  {open && (
                    <p className="mt-[5px] inline-flex items-center gap-[5px] text-[10.5px] font-bold text-[#1D7A4A]">
                      <span className="h-[6px] w-[6px] rounded-full bg-[#1D9E75]" /> Can reply
                    </p>
                  )}
                </div>
              </Link>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
