-- Corrections to 012/013. Written as a new migration rather than an edit to
-- those files because they may already be applied.
--
-- 1. resolve_unit_cost had no total order, so a same-day tie was broken
--    arbitrarily by Postgres.
-- 2. `revoke ... from anon, authenticated` never removed the default PUBLIC
--    EXECUTE grant, so the stated owner-only control was not actually in force
--    on the two cost helpers.

-- ── 1. total order on cost resolution ────────────────────────
-- The OMC revises the commercial rate on the 1st of every month, which is
-- exactly when an old-rate PO and a new-rate PO can both be recorded on the same
-- IST date. `order by (cost_date <= p_date) desc, abs(cost_date - p_date) asc`
-- ranks those two rows equally; with no further key Postgres is free to return
-- either, so one bill could report two different margins on two queries.
--
-- created_at is therefore exposed on the view and used as a tie-break: on a tie
-- the most recently RECORDED purchase wins, which is the one that reflects
-- replacement cost. po_number closes the remaining theoretical tie (two lines
-- written in the same microsecond) so the order is total and the answer is
-- reproducible.
--
-- created_at is appended LAST: `create or replace view` can add columns only at
-- the end of the existing list, it cannot insert one in the middle.
create or replace view public.product_unit_cost as
select
  pl.product_id,
  (po.created_at at time zone 'Asia/Kolkata')::date        as cost_date,
  (pl.amount / pl.qty) / (1 + p.gst_rate / 100.0)          as unit_cost_ex,
  po.po_number,
  po.created_at
from public.purchase_lines pl
join public.purchase_orders po on po.id = pl.purchase_order_id
join public.products p on p.id = pl.product_id
where po.type = 'purchase'
  and pl.qty > 0;

revoke all on public.product_unit_cost from public, anon, authenticated;

create or replace function public.resolve_unit_cost(p_product_id bigint, p_date date)
returns table (unit_cost_ex numeric, cost_source text)
language sql stable as $$
  select uc.unit_cost_ex, uc.po_number
  from public.product_unit_cost uc
  where uc.product_id = p_product_id
  order by
    (uc.cost_date <= p_date) desc,
    abs(uc.cost_date - p_date) asc,
    uc.created_at desc,
    uc.po_number desc
  limit 1
$$;

-- ── 2. the revoke that actually bites ────────────────────────
-- Postgres grants EXECUTE on every new function to PUBLIC by default. Revoking
-- from two named roles leaves that grant standing, so both helpers stayed
-- callable by any signed-in user via POST /rest/v1/rpc/. Nothing leaks today —
-- they are `language sql` with invoker rights, and the revoke on the underlying
-- views does bite — but the control named in the design was not in force, and it
-- would vanish silently the day anyone marked either helper `security definer`.
revoke all on function public.resolve_unit_cost(bigint, date) from public;
revoke all on function public.resolve_line_cost(bigint, date) from public;

-- The four commercial_* functions in 013 have the same default PUBLIC grant.
-- The owner gate still holds there — each is `security definer` and calls
-- require_owner() first, which raises 42501 for anyone who is not an owner, and
-- for anon (auth.uid() is null). Revoked anyway so the privilege matches the
-- intent, then re-granted to `authenticated`, which is the role the app uses.
revoke all on function public.commercial_bill_profit(date, date)          from public;
revoke all on function public.commercial_bill_profit_for_customer(bigint) from public;
revoke all on function public.commercial_bill_line_profit(bigint)         from public;
revoke all on function public.commercial_line_profit_range(date, date)    from public;

grant execute on function public.commercial_bill_profit(date, date)          to authenticated;
grant execute on function public.commercial_bill_profit_for_customer(bigint) to authenticated;
grant execute on function public.commercial_bill_line_profit(bigint)         to authenticated;
grant execute on function public.commercial_line_profit_range(date, date)    to authenticated;
