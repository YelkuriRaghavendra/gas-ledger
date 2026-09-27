-- 019: staff management
--
-- Adds an `active` flag to profiles, lets an owner update anyone's row, and
-- adds a guard trigger that is the real enforcement point for who may change
-- role / segment access / active status.

alter table public.profiles
  add column if not exists active boolean not null default true;

-- Owner predicate.
--
-- security definer is load-bearing. Every other owner check in this schema is
-- written inline as `exists (select 1 from profiles where id = auth.uid() and
-- role = 'owner')`, but those all sit in policies on OTHER tables. The same
-- subquery inside a policy on profiles itself recurses -- Postgres evaluates
-- profiles_read to answer it and raises "infinite recursion detected in policy
-- for relation profiles". A definer function bypasses RLS and breaks the cycle.
--
-- Called with no argument it resolves auth.uid(), which is null under the
-- service-role key, so it returns false there; the Edge Function passes the
-- caller's id explicitly.
create or replace function public.is_active_owner(uid uuid default null)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = coalesce(uid, auth.uid())
      and role = 'owner'
      and active
  )
$$;

-- Permissive policies OR together, so profiles_update_own still lets a staff
-- member edit their own row. The trigger below is what stops them escalating
-- through it.
drop policy if exists "profiles_update_owner" on public.profiles;
create policy "profiles_update_owner" on public.profiles
  for update to authenticated
  using (public.is_active_owner())
  with check (public.is_active_owner());

create or replace function public.enforce_profile_admin_rules()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  actor uuid := auth.uid();
begin
  if tg_op = 'INSERT' then
    -- actor is null under the service-role key (the manage-staff function, a
    -- data import); those callers are trusted to set role directly.
    if actor is not null and new.role <> 'staff' and not public.is_active_owner(actor) then
      raise exception 'only an owner can create an owner account';
    end if;
    return new;
  end if;

  if new.role is distinct from old.role
     or new.segment_access is distinct from old.segment_access
     or new.active is distinct from old.active then

    if actor is not null and not public.is_active_owner(actor) then
      raise exception 'only an owner can change role, segment access or active status';
    end if;

    if actor is not null and new.id = actor then
      if new.role is distinct from old.role then
        raise exception 'you cannot change your own role';
      end if;
      if new.active is distinct from old.active then
        raise exception 'you cannot deactivate yourself';
      end if;
    end if;

    -- Backstop, applied to every caller including the service-role key.
    --
    -- pg_advisory_xact_lock with a fixed key serializes only this check, not
    -- the whole trigger or ordinary profile updates: the branch is only
    -- reached when an active owner is actually being demoted or
    -- deactivated, so a staff member editing their own name never queues
    -- behind it. Without the lock, two transactions each demoting a
    -- different one of exactly two active owners can run concurrently
    -- under READ COMMITTED: neither has committed when the other's `exists`
    -- check runs, so each still sees the other owner as active, both pass,
    -- and both commit -- leaving zero active owners with no in-app way back
    -- in. The lock forces the second transaction to wait for the first to
    -- commit or roll back; READ COMMITTED then gives the second
    -- transaction's `exists` check a fresh snapshot that sees the first
    -- transaction's committed result, so it correctly finds no other active
    -- owner and raises. The key (72176331) is arbitrary but fixed, so every
    -- transaction that could threaten the invariant contends for the same
    -- lock; it is transaction-scoped and releases automatically at commit
    -- or rollback, so there is no matching unlock call.
    if old.role = 'owner' and old.active
       and (new.role <> 'owner' or not new.active) then
      perform pg_advisory_xact_lock(72176331);

      if not exists (
        select 1 from public.profiles
        where id <> new.id and role = 'owner' and active
      ) then
        raise exception 'at least one active owner is required';
      end if;
    end if;
  end if;

  return new;
end $$;

-- Postgres fires BEFORE row triggers in name order, so trg_profile_admin_rules
-- runs before trg_stamp_profiles. The guard reads only role / segment_access /
-- active, none of which stamp_audit touches, so the order does not matter --
-- noted so a future rename is not made blindly.
drop trigger if exists trg_profile_admin_rules on public.profiles;
create trigger trg_profile_admin_rules
  before insert or update on public.profiles
  for each row execute function public.enforce_profile_admin_rules();
