-- The mark-read policy let any signed-in user UPDATE any column of an inbound
-- message (body, phone, ...), which would let a client rewrite what a customer
-- "said". Restrict the client to the one column it needs.
revoke update on public.chat_messages from authenticated;
grant update (read_at) on public.chat_messages to authenticated;
