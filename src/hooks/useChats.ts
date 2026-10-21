import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { ChatMessage } from '../types/db'
import type { ChatCustomer } from '../utils/chat'

const RETENTION_MS = 7 * 24 * 60 * 60 * 1000

// Subscribes to chat_messages and calls `onChange` for every insert/update.
// The channel name is unique per hook instance so two screens never share one.
function useChatRealtime(name: string, onChange: () => void) {
  useEffect(() => {
    const channel = supabase
      .channel(`${name}-${Math.random().toString(36).slice(2)}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'chat_messages' }, onChange)
      .subscribe()
    return () => {
      void supabase.removeChannel(channel)
    }
  }, [name, onChange])
}

/** Every chat message from the last 7 days plus the customer list, kept live. */
export function useChats() {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [customers, setCustomers] = useState<ChatCustomer[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    // The 7-day cutoff is also applied here: the server prune runs once a day,
    // so a message can briefly outlive its week.
    const since = new Date(Date.now() - RETENTION_MS).toISOString()
    const [msgs, custs] = await Promise.all([
      supabase.from('chat_messages').select('*').gte('created_at', since).order('created_at', { ascending: true }),
      supabase.from('customers').select('id, name, phone'),
    ])
    if (msgs.error) setError(msgs.error.message)
    else {
      setError(null)
      setMessages((msgs.data ?? []) as ChatMessage[])
    }
    if (custs.data) setCustomers(custs.data as ChatCustomer[])
    setLoading(false)
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])
  useChatRealtime('chats', refresh)

  return { messages, customers, loading, error, refresh }
}

/** Number of unread inbound messages, for the header badge. */
export function useUnreadChatCount() {
  const [count, setCount] = useState(0)

  const refresh = useCallback(async () => {
    const { count: c } = await supabase
      .from('chat_messages')
      .select('id', { count: 'exact', head: true })
      .eq('direction', 'in')
      .is('read_at', null)
      .gte('created_at', new Date(Date.now() - RETENTION_MS).toISOString())
    setCount(c ?? 0)
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])
  useChatRealtime('chat-unread', refresh)

  return count
}
