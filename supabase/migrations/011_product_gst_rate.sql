-- Profit must be computed on base amounts, not on the GST-inclusive figures the
-- app stores. bill_lines.amount is what the customer hands over and
-- purchase_lines.amount is what we pay the plant, both tax included.
--
-- Rate lives per product rather than in agency_settings because the two
-- segments sit at different slabs: commercial LPG at 18%, domestic at 5%.

alter table public.products
  add column if not exists gst_rate numeric not null default 18;

update public.products set gst_rate = 5 where segment = 'domestic';
