-- Delivery tracking moved to chat_messages.status (written by the same webhook),
-- so these whatsapp_sends columns are no longer read or written.
--
-- DEPLOY ORDER: deploy the whatsapp-status and send-bill-whatsapp functions
-- BEFORE applying this migration. The previous versions of both read these
-- columns and would error once they are gone.
--
-- Irreversible: the delivery history of bills sent before chat existed is lost.
alter table public.whatsapp_sends
  drop column if exists delivery_status,
  drop column if exists delivery_updated_at,
  drop column if exists error_code,
  drop column if exists error_detail;
