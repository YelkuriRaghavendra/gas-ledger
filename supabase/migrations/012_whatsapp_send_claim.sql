-- Atomic claim-before-send for whatsapp_sends. Closes two related races
-- that the previous "check for a sent row, then send, then insert" design
-- could not:
--
--   1. TOCTOU: two concurrent invocations for the same bill both pass the
--      "already sent?" pre-check before either has written a row, and both
--      then send to Meta.
--   2. Post-send insert failure: the send succeeds, but the row recording
--      it fails to insert (or was never reached). A retry finds no 'sent'
--      row for the bill and sends again.
--
-- The fix: the Edge Function inserts a 'pending' row BEFORE calling Meta,
-- then updates that same row in place once the send resolves. The partial
-- unique index below guarantees at most one live (pending or sent) row per
-- bill, so a second concurrent claim attempt fails at insert time instead
-- of racing all the way to Meta.

alter table whatsapp_sends drop constraint whatsapp_sends_status_check;
alter table whatsapp_sends add constraint whatsapp_sends_status_check
  check (status in ('pending', 'sent', 'failed', 'skipped'));

-- Any number of 'failed'/'skipped' rows per bill is fine — retries append,
-- as designed. At most one row that is in-flight or already succeeded.
create unique index whatsapp_sends_one_live_per_bill
  on whatsapp_sends (bill_id)
  where status in ('pending', 'sent');
