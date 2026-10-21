-- Tie a chat message to the bill it announces, so a bill message that failed
-- to send can be retried from the chat. set null (not cascade): deleting a bill
-- should not make its message vanish from the conversation.
alter table public.chat_messages
  add column if not exists bill_id bigint references public.bills(id) on delete set null;

create index if not exists idx_chat_messages_bill
  on public.chat_messages (bill_id) where bill_id is not null;
