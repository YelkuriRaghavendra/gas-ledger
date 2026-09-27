# Account page & staff management — design

Date: 2026-09-27
Status: approved, ready for implementation plan
Scope: account/settings surface, shared by both segments

## Problem

The account surface is a bottom sheet (`AccountMenu`) holding three things:
Reports, Business details, Sign out. There is nowhere in the app to see who else
has a login, and no way to create one or change what one can reach.

Today a new staff member is added by opening the Supabase dashboard, creating an
auth user, and hand-editing `profiles.role` and `profiles.segment_access` in the
SQL editor. The owner cannot do this from the phone, which is the only device
they use the app on.

Two of the three columns that govern access — `role` and `segment_access` —
already drive real behaviour (`ModeGate` routes by segment, Reports and the
WhatsApp opt-in are owner-only), so the ability to set them is the whole feature.

## Decisions

Settled with the owner before this spec. Each has a defensible alternative, and
a future reader will otherwise assume the alternative was overlooked.

### 1. The owner creates the user and sets its first password

An owner-only Edge Function calls `auth.admin.createUser` with the name, email,
password, role and segment access the owner typed. The user can sign in
immediately.

Rejected alternatives:

- **`inviteUserByEmail`.** Correct in a company with email. This is a gas agency
  where the delivery staff's "email" is a Gmail address someone else set up for
  them, checked rarely or never. An invite that expires unread is a support call.
  It also requires SMTP configured on the Supabase project, which it is not.
- **Dashboard-only creation, app edits roles.** Keeps the service-role key out of
  the app entirely, but leaves the owner exactly where they are today for the one
  action that actually prompted this work.

The password the owner sets is a shared-in-person secret, the same way the
godown key is. Self-service password change is out of scope (see below), so the
owner reissuing a password is not yet possible — noted as the first follow-up.

### 2. Deactivation, not deletion

`profiles` gains `active boolean not null default true`. There is no delete.

`bills.created_by`, `bill_lines.created_by`, `purchase_orders.created_by` and
their `updated_by` twins all point at `profiles.id`, and `useProfiles()` resolves
them into "Created by <name>" on every detail screen. Deleting the auth user
cascades the profile row away and those names silently vanish from history that
is years long. Deactivation keeps the record intact and is reversible, which
matters when someone leaves for a season and comes back.

### 3. Deactivation bans the auth user as well as flipping the flag

The `set_active` action does two things with the service-role key: sets
`profiles.active`, and calls `admin.updateUserById(id, { ban_duration })` —
`'876000h'` (100 years) to deactivate, `'none'` to restore.

The flag alone is an app-level convention: a deactivated user's existing JWT
still satisfies every `to authenticated` policy in the schema until it expires,
and they could keep writing bills from an app build that does not check the flag.
A GoTrue ban rejects both sign-in and token refresh, so the session dies within
one refresh cycle regardless of what the client does.

The flag is still needed — it is what the staff list reads, and what RLS and the
guard trigger can see. The two are written together in one function so they
cannot drift.

`AuthContext` additionally signs out a live session whose profile comes back
`active = false`, so the screen clears at once rather than at the next refresh.

### 4. Guard rules live in a database trigger, not only in the UI

A `before insert or update` trigger on `profiles` enforces:

- Only an active owner may change `role`, `segment_access` or `active`.
- You may not change your own role, or deactivate yourself.
- No change may leave the agency with zero active owners.
- A self-insert (the `profiles_insert` policy allows `id = auth.uid()`) may not
  claim `role = 'owner'`.

The first and fourth rules close a hole that predates this feature: the existing
`profiles_update_own` policy lets any signed-in user update their own row, which
includes `role`. Until now nothing in the UI offered that, so it was unreachable
in practice; adding a staff screen makes the column visibly editable and the
policy worth closing properly.

The self-demotion and last-owner rules are repeated in the Edge Function so the
owner gets a readable message instead of a raised Postgres exception, but the
trigger is what actually enforces them — including against the service-role key,
which bypasses RLS but not triggers.

### 5. Owner-gating applies to writes, not to reading the roster

`profiles_read` stays `using (true)`. The Staff page is gated in the UI by an
`OwnerRoute` guard; a staff member who forced the URL would see the list.

Tightening the read policy to "own row or owner" was considered and rejected:
`useProfiles()` reads every profile to resolve `created_by` into a name on the
customer, bill and purchase detail screens, and narrowing it would blank those
labels for staff. In a five-person agency the roster is not a secret — who can
*change* it is the part that matters, and that is enforced in the database.

## Data model

Migration `supabase/migrations/019_staff_management.sql`, mirrored into the
canonical `db/schema.sql`.

### Column

```sql
alter table public.profiles
  add column if not exists active boolean not null default true;
```

### Owner predicate

```sql
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
```

`security definer` is load-bearing. Every existing owner check in the schema is
written inline as `exists (select 1 from profiles where id = auth.uid() and role
= 'owner')`, but all of those sit in policies on *other* tables. The same
subquery inside a policy on `profiles` itself recurses — Postgres evaluates
`profiles_read` to answer it and errors with `infinite recursion detected in
policy for relation "profiles"`. A definer function bypasses RLS and breaks the
cycle.

Called with no argument it resolves `auth.uid()`, which is `null` under the
service-role key, so it returns false there. The Edge Function therefore passes
the caller's id explicitly when it checks.

### Policy

```sql
drop policy if exists "profiles_update_owner" on public.profiles;
create policy "profiles_update_owner" on public.profiles
  for update to authenticated
  using (public.is_active_owner())
  with check (public.is_active_owner());
```

`profiles_update_own` and `profiles_insert` are unchanged. Permissive policies
OR together, so a staff member keeps the ability to edit their own row; the
trigger is what stops them escalating through it.

### Guard trigger

```sql
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
    -- actor is null under the service-role key (the Edge Function, data
    -- import); those callers are trusted to set role directly.
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
    if old.role = 'owner' and old.active
       and (new.role <> 'owner' or not new.active)
       and not exists (
         select 1 from public.profiles
         where id <> new.id and role = 'owner' and active
       ) then
      raise exception 'at least one active owner is required';
    end if;
  end if;

  return new;
end $$;

drop trigger if exists trg_profile_admin_rules on public.profiles;
create trigger trg_profile_admin_rules
  before insert or update on public.profiles
  for each row execute function public.enforce_profile_admin_rules();
```

Trigger ordering: Postgres fires `before` row triggers in name order, so
`trg_profile_admin_rules` runs before `trg_stamp_profiles`. The guard reads only
`role`, `segment_access` and `active`, none of which `stamp_audit` touches, so
the order is immaterial — recorded here so a future rename is not made blindly.

### Audit trail

`trg_stamp_profiles` already stamps `updated_at` and `updated_by` from
`auth.uid()`. Under the service-role key `auth.uid()` is null and `stamp_audit`
falls back to `coalesce(auth.uid(), new.updated_by)`, so the Edge Function must
pass `updated_by` (and `created_by` on insert) explicitly — the caller's id, not
its own. The staff edit screen reads these back as "Last changed by <name> on
<date>".

### No `handle_new_user` trigger in v4

`supabase/schema.sql` and `supabase/fresh_setup.sql` — both superseded by
`db/schema.sql` v4.0 — carried an `on_auth_user_created` trigger that inserted a
`profiles` row for every new auth user. **v4 does not have it.** Creating an auth
user in a v4 database therefore leaves no profile row behind, and the Edge
Function must insert one itself.

Whether the live database still carries the legacy trigger is not knowable from
the repository, so the function's insert is written as `insert ... on conflict
(id) do update set ...`. It creates the row in a clean v4 database and overwrites
the trigger's `role = 'staff'` default in a database that still has it, without
needing to know which it is talking to.

## Edge Function: `manage-staff`

`supabase/functions/manage-staff/`, following `send-bill-whatsapp`: the same CORS
header block on every response path including errors, an anon client carrying the
caller's `Authorization` header to establish identity, and a separate
service-role client for the privileged work.

### Request

```
POST /functions/v1/manage-staff

{ "action": "create",
  "name": "Ramesh", "email": "ramesh@…", "password": "…",
  "role": "staff", "segment_access": "both" }

{ "action": "set_active", "user_id": "<uuid>", "active": false }
```

### Responses

| Status | Body | Cause |
|---|---|---|
| 200 | `{ ok: true, user_id }` | created |
| 200 | `{ ok: true }` | activation changed |
| 400 | `{ error: 'invalid_request', detail }` | validation failed |
| 401 | `{ error: 'unauthorized' }` | no or bad session |
| 403 | `{ error: 'forbidden', detail }` | caller not an active owner; self-deactivate; last owner |
| 409 | `{ error: 'email_taken' }` | address already registered |
| 500 | `{ error: 'server_error' }` | unexpected |

### `create`

1. `anon.auth.getUser()` → 401 if absent.
2. Service-role read of the caller's profile; require `role = 'owner'` and
   `active` → 403.
3. Validate the body → 400.
4. `admin.createUser({ email, password, email_confirm: true, user_metadata: { name } })`.
   `email_confirm: true` because no mail is being sent and an unconfirmed user
   cannot sign in. A duplicate address → 409.
5. `insert into profiles (id, name, role, segment_access, active, created_by,
   updated_by) ... on conflict (id) do update` — `created_by` and `updated_by`
   both the caller's id.
6. If step 5 fails, `admin.deleteUser(id)` and return 500. Without the rollback a
   failed insert strands an auth user that can sign in with no profile row, which
   `ModeGate` renders as a permanent loading screen.

### `set_active`

1. Steps 1–3 as above.
2. Refuse `user_id === caller.id` → 403.
3. Deactivating the last active owner → 403, checked before writing so the owner
   sees a sentence rather than a Postgres exception. The trigger repeats it.
4. `admin.updateUserById(user_id, { ban_duration: active ? 'none' : '876000h' })`.
5. `update profiles set active, updated_by = caller.id`.

Order matters: the ban goes first. If step 5 fails the user is banned but still
shows as active — visibly wrong, and safe. The reverse order would show them as
deactivated while their session kept working.

### Pure helpers

`validation.ts` beside `index.ts`, unit-tested as `validation.test.ts` — the
convention `templates.ts` and `statuses.ts` already follow, since Deno-imported
modules with no network calls run fine under vitest.

- `name` — trimmed, 1–60 characters
- `email` — trimmed, lowercased, must contain a single `@` with text both sides
- `password` — at least 8 characters (Supabase's own floor is 6)
- `role` — `owner | staff`
- `segment_access` — `commercial | domestic | both`

## UI

### Account — new, `/account`

Replaces `AccountMenu` outright; the component file is deleted.

`AppHeader` currently takes an `onOpenAccount` callback, and all eleven pages
that render it hold an `accountOpen` boolean and a copy of `<AccountMenu …/>`
purely to feed it. `AppHeader` now calls `navigate('/account')` itself and the
prop is dropped, so those eleven pages shed the state, the import and the render.

The page carries the sheet's content at full size: `InitialsBadge`, name, and
`<business> · <Role>` beneath it; then the rows.

| Row | Visible to |
|---|---|
| Reports → `/commercial/reports` | owner |
| Staff → `/account/staff` | owner |
| Business details → `/account/business` | everyone |
| Sign out | everyone |

`/account` is already exempted from `ModeGate`'s segment routing, so the page
works identically from either side.

### Staff — new, `/account/staff`

Active members first, then a separated "Inactive" group. Each row: name, a role
pill, a segment-access pill, and the caller's own row marked "You". Tapping a row
opens the edit screen. A "Add staff member" button sits at the foot.

### Staff edit — new, `/account/staff/new` and `/account/staff/:id`

One component in two modes, the way `NewSale` handles new-versus-edit.

- **New** — name, email, password, role, segment access. Submits through the Edge
  Function.
- **Edit** — name, role, segment access, and an Active toggle. Name, role and
  segment access are a direct `supabase.from('profiles').update()`; the toggle
  goes through the Edge Function. Email is read-only (changing it is out of
  scope). Footer shows "Last changed by <name> on <date>".
- **Editing yourself** — role, segment access and the Active toggle are disabled
  with the reason shown inline. Name stays editable.

Errors from the function are surfaced verbatim from `detail`, in the same
red-text position `BusinessDetails` uses.

### Guard

`components/OwnerRoute.tsx`, an `<Outlet/>` guard on the pattern of
`ProtectedRoute`: non-owners are redirected to `/account`. It wraps
`/account/staff/*` and also `/commercial/reports`, which is currently owner-only
by UI hiding alone — the data behind it is already gated in the database, so this
closes the cosmetic gap of a staff member reaching a screen of errors.

### Supporting files

- `hooks/useStaff.ts` — list of profiles with `refresh`, matching the shape of
  `useAgencySettings`.
- `utils/staff.ts` + `utils/staff.test.ts` — pure: `validateNewStaff`,
  `canEditOwnAccess`, `wouldOrphanOwners`, `sortStaff`, `roleLabel`,
  `segmentLabel`.
- `types/db.ts` — `Profile` gains `active`, `updated_at`, `updated_by`.
- `auth/AuthContext.tsx` — selects `active`; a profile with `active = false`
  triggers `signOut()` instead of being stored.
- `pages/Login.tsx` — shows "Your access has been turned off. Ask the owner." for
  the ban message GoTrue returns.

## Testing

Vitest, matching the existing suites, all of which test pure functions rather
than mounting components.

`utils/staff.test.ts`:

- validation accepts and rejects each field at its boundary
- `canEditOwnAccess` is false for your own id, true for others
- `wouldOrphanOwners` — demoting the only active owner, deactivating the only
  active owner, demoting one of two, demoting an owner while an inactive owner
  exists (still orphans)
- `sortStaff` — active before inactive, name order within each

`supabase/functions/manage-staff/validation.test.ts`: every 400 case, plus
email normalisation.

Database rules are not reachable from vitest. They are verified by hand against
the Supabase SQL editor after the migration, and the checks are listed in the
implementation plan as an explicit step:

1. staff updating their own `role` → rejected
2. owner demoting themselves → rejected
3. owner deactivating themselves → rejected
4. demoting the last active owner → rejected
5. demoting an owner while a second active owner exists → succeeds
6. owner updating another profile's `segment_access` → succeeds, `updated_by`
   stamped with the owner's id

Finally `npm run build` and a pass through the screens on a real session: create
a staff member, sign in as them, confirm the segment gate and the absent Staff
row, deactivate them, confirm sign-in is refused.

## Out of scope

- Changing or reissuing a password, by the owner or the user. The first
  follow-up; it needs a decision about whether the owner sees the new password.
- Changing a user's email address.
- Permissions finer than `role` + `segment_access` — no per-screen matrix.
- Deleting a user outright.
- Any audit log beyond the `updated_by` / `updated_at` stamp already on the row.
