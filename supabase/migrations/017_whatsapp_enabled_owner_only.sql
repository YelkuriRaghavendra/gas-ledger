-- Enforce, server-side, that only an owner can flip whatsapp_enabled.
--
-- The design spec claimed an "owner update customers" RLS policy already
-- restricted all customer updates to owners. That policy does not exist —
-- customers_write is `for all to authenticated using (true) with check
-- (true)`, so any signed-in staff account can enable WhatsApp for any
-- customer directly via the Supabase client and cause real messages to be
-- sent. The isOwner gates in the UI are cosmetic without this.
--
-- This is deliberately NOT an RLS policy. A restrictive `with check
-- (whatsapp_enabled = false or is_owner())` would also block a staff member
-- from editing the phone number of an already-enabled customer, because the
-- post-update row still has the flag set — that breaks normal staff work.
-- A trigger can compare old vs new and restrict only a change to the flag
-- itself, leaving every other column staff-editable as before.

create or replace function enforce_whatsapp_enabled_owner_only()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    if new.whatsapp_enabled and not exists (
      select 1 from profiles where id = auth.uid() and role = 'owner'
    ) then
      raise exception 'only an owner can enable WhatsApp for a customer';
    end if;
  elsif new.whatsapp_enabled is distinct from old.whatsapp_enabled and not exists (
    select 1 from profiles where id = auth.uid() and role = 'owner'
  ) then
    raise exception 'only an owner can change whatsapp_enabled';
  end if;
  return new;
end $$;

drop trigger if exists trg_whatsapp_enabled_owner_only on customers;
create trigger trg_whatsapp_enabled_owner_only
  before insert or update on customers
  for each row execute function enforce_whatsapp_enabled_owner_only();
