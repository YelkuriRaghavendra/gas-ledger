-- The app's existing profile?.role === 'owner' checks only hide UI. Every table
-- carries `for select to authenticated using (true)`, so a staff member with a
-- browser console can read cost data directly. Profit output is therefore gated
-- here, where the API itself refuses.
--
-- Staff keep the Purchases screen: raw purchase visibility is deliberately
-- unchanged. Only the derived profit figures are owner-only.

create or replace function public.is_owner()
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.profiles where id = auth.uid() and role = 'owner'
  )
$$;

create or replace function public.require_owner()
returns void
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_owner() then
    -- 42501 = insufficient_privilege. Deliberately an error, not an empty set:
    -- an empty set renders as "no profit this month" and hides the refusal.
    raise exception 'owner role required' using errcode = '42501';
  end if;
end $$;

create or replace function public.commercial_bill_profit(p_from date, p_to date)
returns setof public.bill_profit
language plpgsql stable security definer set search_path = public as $$
begin
  perform public.require_owner();
  return query
    select * from public.bill_profit
    where day >= p_from and day < p_to
    order by created_at desc;
end $$;

create or replace function public.commercial_bill_profit_for_customer(p_customer_id bigint)
returns setof public.bill_profit
language plpgsql stable security definer set search_path = public as $$
begin
  perform public.require_owner();
  return query
    select * from public.bill_profit
    where customer_id = p_customer_id
    order by created_at desc;
end $$;

create or replace function public.commercial_bill_line_profit(p_bill_id bigint)
returns setof public.bill_line_profit
language plpgsql stable security definer set search_path = public as $$
begin
  perform public.require_owner();
  return query
    select * from public.bill_line_profit where bill_id = p_bill_id;
end $$;

-- Line-level rows for a period, so Reports can break profit down by product.
create or replace function public.commercial_line_profit_range(p_from date, p_to date)
returns setof public.bill_line_profit
language plpgsql stable security definer set search_path = public as $$
begin
  perform public.require_owner();
  return query
    select * from public.bill_line_profit
    where day >= p_from and day < p_to;
end $$;

grant execute on function public.commercial_bill_profit(date, date)          to authenticated;
grant execute on function public.commercial_bill_profit_for_customer(bigint) to authenticated;
grant execute on function public.commercial_bill_line_profit(bigint)         to authenticated;
grant execute on function public.commercial_line_profit_range(date, date)    to authenticated;
