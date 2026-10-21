-- In-app WhatsApp chat with customers.
--
-- Messages are kept for 7 days only. Bills, payments and statements are the
-- durable record; chat is for day-to-day coordination, so older messages are
-- deleted rather than archived.
--
-- Rows are written only by Edge Functions (service role): the webhook stores
-- inbound messages and send-chat-message stores outbound ones. There is
-- deliberately NO insert policy for authenticated, so a client cannot forge
-- a message that appears to come from a customer.

create table if not exists public.chat_messages (
  id              bigint generated always as identity primary key,
  -- Meta's message id (wamid). Unique so a webhook retry cannot duplicate a row.
  wa_message_id   text unique,
  -- Digits-only E.164 without '+', as Meta reports it (e.g. 919876543210).
  -- Matched to a customer in the app by normalising customers.phone.
  phone           text not null,
  direction       text not null check (direction in ('in', 'out')),
  msg_type        text not null default 'text',
  -- Null for non-text messages (image, audio, ...): the app shows a placeholder.
  body            text,
  -- The sender's WhatsApp profile name, shown for numbers not in the customer list.
  profile_name    text,
  -- Outbound only: what Meta's delivery webhook reported.
  status          text check (status in ('sent', 'delivered', 'read', 'failed')),
  created_by      uuid,
  created_at      timestamptz not null default now(),
  -- Inbound only: set when someone opens the conversation.
  read_at         timestamptz
);

create index if not exists idx_chat_messages_phone_created
  on public.chat_messages (phone, created_at desc);
create index if not exists idx_chat_messages_created
  on public.chat_messages (created_at);
create index if not exists idx_chat_messages_unread
  on public.chat_messages (phone) where direction = 'in' and read_at is null;

alter table public.chat_messages enable row level security;

drop policy if exists "chat_messages_read" on public.chat_messages;
create policy "chat_messages_read" on public.chat_messages
  for select to authenticated using (true);

-- The only client write: marking a customer's inbound messages as read.
drop policy if exists "chat_messages_mark_read" on public.chat_messages;
create policy "chat_messages_mark_read" on public.chat_messages
  for update to authenticated
  using (direction = 'in') with check (direction = 'in');

-- Live updates for the open conversation and the unread badge.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'chat_messages'
  ) then
    alter publication supabase_realtime add table public.chat_messages;
  end if;
end $$;

-- Daily 7-day cleanup. pg_cron is available on Supabase; if it cannot be
-- enabled the webhook also prunes on every inbound message, so retention still
-- holds on any active day.
do $$
begin
  create extension if not exists pg_cron;
  perform cron.schedule(
    'chat-messages-prune',
    '17 3 * * *',
    $job$delete from public.chat_messages where created_at < now() - interval '7 days'$job$
  );
exception when others then
  raise notice 'chat_messages prune job not scheduled: %', sqlerrm;
end $$;
