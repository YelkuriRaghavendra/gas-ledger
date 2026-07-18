-- Optional named alternate prices per product (e.g. Regular vs Commercial).
-- The base `price` column stays the default; price_options holds extras as
-- a JSON array of {label, amount}. Additive, idempotent, safe on live DB.
alter table public.products
  add column if not exists price_options jsonb not null default '[]'::jsonb;
