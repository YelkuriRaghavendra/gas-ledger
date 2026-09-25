-- Delivery reporting for WhatsApp bill notifications.
--
-- whatsapp_sends.status records what happened when we CALLED Meta: 'sent'
-- means Meta accepted the message and returned a wamid. It says nothing about
-- whether the message reached the customer's phone — a message can be accepted
-- and then silently dropped, and Meta reports that only to a webhook.
--
-- These columns hold what the webhook tells us afterwards, kept separate from
-- `status` so the two questions stay distinguishable: did we manage to send it,
-- and did it actually arrive.

alter table public.whatsapp_sends
  add column if not exists delivery_status text
    check (delivery_status in ('sent', 'delivered', 'read', 'failed')),
  add column if not exists delivery_updated_at timestamptz,
  add column if not exists error_code int,
  add column if not exists error_detail text;

-- The webhook arrives with only a wamid, so this is the lookup path for every
-- callback. Partial, because rows that never reached Meta have no message_id.
-- UNIQUE because a wamid identifies exactly one send: with duplicates the
-- lookup returns nothing and the delivery status is silently discarded.
create unique index if not exists idx_whatsapp_sends_message_id
  on public.whatsapp_sends (message_id)
  where message_id is not null;
