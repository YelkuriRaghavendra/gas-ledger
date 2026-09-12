-- WhatsApp bill notifications.
-- whatsapp_enabled defaults to false: nothing is sent until a customer is
-- explicitly opted in, so deploying this migration cannot message anyone.
alter table customers
  add column whatsapp_enabled boolean not null default false;

-- One row per send ATTEMPT, not per bill. A retry appends a row so the
-- history of what failed and why is preserved.
create table whatsapp_sends (
  id         bigint generated always as identity primary key,
  bill_id    bigint not null references bills(id) on delete cascade,
  status     text   not null check (status in ('sent','failed','skipped')),
  reason     text,
  message_id text,
  template   text   not null,
  created_at timestamptz not null default now()
);

create index whatsapp_sends_bill_id_idx on whatsapp_sends (bill_id);

alter table whatsapp_sends enable row level security;

-- Read-only for the app. There is deliberately NO insert policy for
-- authenticated: rows are written solely by the Edge Function using the
-- service role key, which bypasses RLS. A client able to insert here could
-- fake a 'sent' status for a bill that was never delivered.
create policy "read whatsapp_sends" on whatsapp_sends
  for select to authenticated using (true);
