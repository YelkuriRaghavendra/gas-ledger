-- Cost basis: the latest purchase rate on or before the sale date — replacement
-- cost, not a blended average. The OMC revises the commercial rate on the 1st of
-- every month, so two bills for the same product at the same sale price will
-- legitimately show different profit if a revision fell between them.

create or replace view public.product_unit_cost as
select
  pl.product_id,
  (po.created_at at time zone 'Asia/Kolkata')::date        as cost_date,
  (pl.amount / pl.qty) / (1 + p.gst_rate / 100.0)          as unit_cost_ex,
  po.po_number
from public.purchase_lines pl
join public.purchase_orders po on po.id = pl.purchase_order_id
join public.products p on p.id = pl.product_id
where po.type = 'purchase'
  and pl.qty > 0;

revoke all on public.product_unit_cost from anon, authenticated;

-- Prefers the nearest purchase on or before the sale date. Falls forward to the
-- earliest purchase after it when the product was first bought later than the
-- sale — otherwise a backdated bill would report infinite margin.
create or replace function public.resolve_unit_cost(p_product_id bigint, p_date date)
returns table (unit_cost_ex numeric, cost_source text)
language sql stable as $$
  select uc.unit_cost_ex, uc.po_number
  from public.product_unit_cost uc
  where uc.product_id = p_product_id
  order by
    (uc.cost_date <= p_date) desc,
    abs(uc.cost_date - p_date) asc
  limit 1
$$;

revoke all on function public.resolve_unit_cost(bigint, date) from anon, authenticated;

-- A bundle line (New Connection) has no purchase of its own; it costs as the sum
-- of its components. If any component's cost is unknown the sum is null, and the
-- line is flagged rather than silently costed at zero.
-- Scalar subqueries, not UNION ALL + LIMIT 1: a union's row order is not
-- guaranteed without ORDER BY, and the bundle branch is a bare aggregate that
-- returns a NULL row even for products that are not bundles. This form always
-- returns exactly one row and always prefers the direct cost.
--
-- bool_and forces the bundle cost to NULL when ANY component cost is unknown.
-- Without it, sum() would quietly skip the unknown component and report a
-- partial cost as if it were the whole thing.
create or replace function public.resolve_line_cost(p_product_id bigint, p_date date)
returns table (unit_cost_ex numeric, cost_source text)
language sql stable as $$
  select
    coalesce(
      (select d.unit_cost_ex from public.resolve_unit_cost(p_product_id, p_date) d),
      bundle.cost
    ),
    case
      when exists (select 1 from public.resolve_unit_cost(p_product_id, p_date))
        then (select d.cost_source from public.resolve_unit_cost(p_product_id, p_date) d)
      when bundle.cost is not null then 'bundle'
      else null
    end
  from (
    select case
             when bool_and(comp.unit_cost_ex is not null)
               then sum(bc.qty * comp.unit_cost_ex)
           end as cost
    from public.bundle_components bc
    left join lateral public.resolve_unit_cost(bc.component_product_id, p_date) comp on true
    where bc.bundle_product_id = p_product_id
  ) bundle
$$;

revoke all on function public.resolve_line_cost(bigint, date) from anon, authenticated;

create or replace view public.bill_line_profit as
select
  bl.id                                                      as bill_line_id,
  b.id                                                       as bill_id,
  b.bill_number,
  b.customer_id,
  b.created_at,
  (b.created_at at time zone 'Asia/Kolkata')::date           as day,
  b.paid,
  bl.product_id,
  p.name                                                     as product_name,
  p.gst_rate,
  bl.qty,
  bl.amount                                                  as revenue_incl,
  round(bl.amount / (1 + p.gst_rate / 100.0), 2)             as revenue_ex,
  round(bl.amount - bl.amount / (1 + p.gst_rate / 100.0), 2) as gst_out,
  round(c.unit_cost_ex, 2)                                   as unit_cost_ex,
  round(bl.qty * c.unit_cost_ex, 2)                          as cost_ex,
  round(bl.qty * c.unit_cost_ex * p.gst_rate / 100.0, 2)     as gst_in,
  round(bl.amount / (1 + p.gst_rate / 100.0)
        - bl.qty * c.unit_cost_ex, 2)                        as profit,
  (c.unit_cost_ex is not null)                               as cost_known,
  c.cost_source
from public.bill_lines bl
join public.bills b on b.id = bl.bill_id
join public.products p on p.id = bl.product_id
left join lateral public.resolve_line_cost(
  bl.product_id, (b.created_at at time zone 'Asia/Kolkata')::date
) c on true
where b.type = 'sale'
  and p.segment = 'commercial';

revoke all on public.bill_line_profit from anon, authenticated;

create or replace view public.bill_profit as
select
  bill_id, bill_number, customer_id, created_at, day, paid,
  sum(qty)           as qty,
  sum(revenue_incl)  as revenue_incl,
  sum(revenue_ex)    as revenue_ex,
  sum(cost_ex)       as cost_ex,
  sum(profit)        as profit,
  sum(gst_out)       as gst_out,
  sum(gst_in)        as gst_in,
  bool_and(cost_known) as cost_known
from public.bill_line_profit
group by bill_id, bill_number, customer_id, created_at, day, paid;

revoke all on public.bill_profit from anon, authenticated;
