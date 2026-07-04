-- Phase 3 of "2.0": reporting & insights.
-- Adds daily/monthly rollup views for the new Reports screen. Sale/return
-- figures are broken down by product (possible now that Phase 1 exists);
-- payments stay combined since they aren't product-specific.
--
-- Purchases-derived views (daily_purchase_summary) read Phase 2's
-- `purchases` table. Per the Phase 3 spec, this migration is numbered after
-- Phase 2's (007_purchases_and_godown.sql), so by the time migrations run
-- against a live Supabase project in the normal order, `purchases` will
-- already exist. This migration does NOT special-case a missing `purchases`
-- table — it assumes 007 has already run. If this migration is ever run
-- against a database where 007 has not run, `daily_purchase_summary` will
-- fail to create; run migrations in numeric order to avoid this.
--
-- The React/TypeScript side of this phase does not hard-depend on this view
-- existing at runtime: useDailySummary/useMonthlySummary query it
-- defensively and simply omit the "Purchased from supplier" section if the
-- query errors (e.g. relation does not exist), so the app still degrades
-- gracefully in an environment where Phase 2 hasn't shipped yet.

create view daily_product_summary as
select
  date_trunc('day', t.created_at) as day,
  t.product_id,
  p.name as product_name,
  coalesce(sum(t.qty) filter (where t.type = 'sale'), 0) as cylinders_sold,
  coalesce(sum(t.amount) filter (where t.type = 'sale'), 0) as revenue,
  coalesce(sum(t.amount) filter (where t.type = 'sale' and t.paid), 0) as collected_at_sale,
  coalesce(sum(t.empties) filter (where t.type = 'sale'), 0)
    + coalesce(sum(t.qty) filter (where t.type = 'return'), 0) as empties_collected
from transactions t
join products p on p.id = t.product_id
where t.type in ('sale', 'return')
group by 1, 2, 3;

create view daily_money_summary as
select
  date_trunc('day', created_at) as day,
  coalesce(sum(amount) filter (where type = 'payment'), 0) as payments_collected
from transactions
where type = 'payment'
group by 1;

-- Assumption (flagged, see Phase 3 spec): purchases has shape
-- product_id, qty, empties_given, amount, paid, method, note, created_at.
-- Only this view needs to change if Phase 2 ships a different shape.
create view daily_purchase_summary as
select
  date_trunc('day', created_at) as day,
  product_id,
  coalesce(sum(qty), 0) as cylinders_purchased,
  coalesce(sum(empties_given), 0) as empties_given_to_supplier,
  coalesce(sum(amount), 0) as purchase_amount
from purchases
group by 1, 2;

-- Monthly rollups are views-of-views over the daily rollups above, per spec,
-- rather than duplicating the transaction-level aggregation.
create view monthly_product_summary as
select
  date_trunc('month', day) as month,
  product_id,
  product_name,
  sum(cylinders_sold) as cylinders_sold,
  sum(revenue) as revenue,
  sum(collected_at_sale) as collected_at_sale,
  sum(empties_collected) as empties_collected
from daily_product_summary
group by 1, 2, 3;

create view monthly_money_summary as
select date_trunc('month', day) as month, sum(payments_collected) as payments_collected
from daily_money_summary
group by 1;

-- RLS: all views are read-only rollups over transactions/purchases, which
-- already carry `for select to authenticated using (true)` policies. Views
-- inherit the querying user's access to their underlying tables in this
-- Supabase setup (same as customer_balances/activity_feed), so no new
-- policies are needed here.
