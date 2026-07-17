-- Adds a per-product flag marking a combo as a "New Connection" so its
-- sales are counted in the domestic New-Connections-sold summaries.
-- Safe to run on the live DB (idempotent, additive, defaults false).
alter table public.products
  add column if not exists is_new_connection boolean not null default false;
