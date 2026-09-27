# Staff management — rollout

Everything in this feature is committed and passing locally, but two steps touch
the live Supabase project and were deliberately left for you to run: the
migration and the Edge Function deploy. Until both are done the Staff screens
render but cannot create or deactivate anyone.

Run the steps in order. Step 2 is the one worth not skipping — the guard trigger
is the only thing standing between a mis-tap and an agency with no owner, and
nothing in the test suite can exercise it.

## 1. Apply the migration

The project is already linked (`Gas ERP`, `kwnlwsnopfqqhmwgaqvh`).

```bash
npx supabase db push
```

If you would rather paste it by hand, the file is
[`supabase/migrations/019_staff_management.sql`](../supabase/migrations/019_staff_management.sql) —
open the Supabase SQL editor and run its contents.

Expected: `Success. No rows returned.`

It is additive and re-runnable: a new `active` column defaulting to `true`, a
`public.is_active_owner()` helper, one extra RLS policy, and one trigger. No
existing column is altered and no row is rewritten. Everyone currently in
`profiles` comes out `active = true`.

## 2. Verify the guard rules

These rules cannot be reached from vitest — there is no Postgres in the test
environment — so this is the only place they get checked. Run each block in the
SQL editor. Every one is wrapped in a transaction that rolls back, so nothing
sticks.

First, get the ids you need:

```sql
select id, name, role, active from profiles order by role, name;
```

Substitute them below.

```sql
-- 1. staff changing their own role -> rejected
begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"<staff-uuid>"}';
  update profiles set role = 'owner' where id = '<staff-uuid>';
rollback;
-- Expect: ERROR: only an owner can change role, segment access or active status
```

```sql
-- 2. owner demoting themselves -> rejected
begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"<owner-uuid>"}';
  update profiles set role = 'staff' where id = '<owner-uuid>';
rollback;
-- Expect: ERROR: you cannot change your own role
```

```sql
-- 3. owner deactivating themselves -> rejected
begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"<owner-uuid>"}';
  update profiles set active = false where id = '<owner-uuid>';
rollback;
-- Expect: ERROR: you cannot deactivate yourself
```

```sql
-- 4. demoting the last active owner, as the service role -> rejected
--    (the SQL editor runs unimpersonated, which is the point: this rule
--     applies to every caller, including the Edge Function's service-role key)
begin;
  update profiles set role = 'staff' where id = '<the-only-owner-uuid>';
rollback;
-- Expect: ERROR: at least one active owner is required
```

```sql
-- 5. owner updating someone else's segment access -> succeeds, updated_by stamped
begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"<owner-uuid>"}';
  update profiles set segment_access = 'domestic' where id = '<staff-uuid>';
  select segment_access, updated_by from profiles where id = '<staff-uuid>';
rollback;
-- Expect: one row, segment_access = 'domestic', updated_by = <owner-uuid>
```

```sql
-- 6. demoting one of two active owners -> succeeds
--    Run only if you genuinely have two active owners; otherwise skip it.
begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"<owner-a-uuid>"}';
  update profiles set role = 'staff' where id = '<owner-b-uuid>';
  select id, role from profiles where id = '<owner-b-uuid>';
rollback;
-- Expect: one row, role = 'staff'
```

If check 1 instead fails with `infinite recursion detected in policy for
relation "profiles"`, the `is_active_owner` function lost its `security
definer`. Stop and fix that before going further — it is what keeps a policy on
`profiles` from re-entering itself.

## 3. Deploy the Edge Function

```bash
npx supabase functions deploy manage-staff
```

`SUPABASE_URL`, `SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY` are injected
by the platform — there are no secrets to set.

Expected: `Deployed Functions on project kwnlwsnopfqqhmwgaqvh: manage-staff`.

## 4. Walk it through

```bash
npm run dev
```

**As the owner**

1. Tap the avatar in the header. You should land on a full `/account` page —
   Reports, Staff, Business details, Sign out — not the old bottom sheet.
2. Open Staff. Your own row is marked "You".
3. Tap your own row. Role, "Can use" and "Can sign in" are all disabled, with
   the reason shown beneath them. Your name is still editable.
4. Back, then "Add staff member". Enter a name, an email, and a 7-character
   password. Submit. Expect "Password must be at least 8 characters" and no user
   created.
5. Fix the password to 8+ characters, choose role Staff and "Domestic". Submit.
   You land back on the roster with the new person listed, Staff and Domestic
   pills showing.
6. Add a second person with the same email. Expect "That email already has a
   login."

**As the new staff member** (use a private window)

7. Sign in. You land on `/domestic` and there is no swap button — their
   `segment_access` is not `both`.
8. Tap the avatar. `/account` shows Business details and Sign out only — no
   Reports, no Staff.
9. Type `/account/staff` into the address bar. You are redirected to `/account`.
10. Type `/commercial/reports`. Same redirect.

**Turning access off**

11. Back in the owner window, open the new person's row, untick "Can sign in",
    save. They move to the "Turned off" group with an "Off" pill.
12. In the staff window, reload. You are bounced to the login screen reading
    "Your access has been turned off. Ask the owner to turn it back on."
13. Try signing in as them again. Same message, sign-in refused.
14. Owner re-ticks "Can sign in". They can sign in again.

## What is deliberately not here

- **Changing or reissuing a password**, by the owner or the user. This is the
  first thing to add next; it needs a decision about whether the owner sees the
  new password. Today a forgotten password means a Supabase dashboard reset.
- **Changing a user's email.**
- **Deleting a user.** Deactivation is the offboarding path, so that
  "Created by <name>" keeps resolving on bills and purchases going back years.
- **Permissions finer than role + segment access.** There is no per-screen
  matrix.

## If something goes wrong

The migration is additive, so rolling the app back does not require rolling the
schema back — the extra column and policy are harmless to older code.

To undo it anyway:

```sql
drop trigger if exists trg_profile_admin_rules on public.profiles;
drop function if exists public.enforce_profile_admin_rules();
drop policy if exists "profiles_update_owner" on public.profiles;
drop function if exists public.is_active_owner(uuid);
alter table public.profiles drop column if exists active;
```

Anyone banned through the Staff screen stays banned after that — the ban lives
in GoTrue, not in `profiles`. Lift it from Authentication → Users in the
dashboard.
