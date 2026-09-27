# Account Page & Staff Management Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the owner a full-page account screen and an owner-only staff roster where logins are created, roles and segment access are changed, and people are deactivated — without opening the Supabase dashboard.

**Architecture:** Three layers. A Postgres migration adds `profiles.active`, an owner-update policy, and a guard trigger that is the real enforcement point for every access rule. An owner-only Edge Function (`manage-staff`) holds the two operations that need the service-role key — creating an auth user, and banning/unbanning one — and validates its input through a pure module tested under vitest. The React layer is three new pages behind an `OwnerRoute` guard; everything the client can do without the service-role key (editing name, role and segment access) goes straight through RLS.

**Tech Stack:** React 18 + react-router-dom 6, TypeScript (strict, `noUnusedLocals`), Tailwind, Supabase (Postgres + RLS + GoTrue + Deno Edge Functions), vitest (node environment, pure-function tests only).

**Spec:** `docs/superpowers/specs/2026-09-27-staff-management-design.md`

## Global Constraints

- Role values are exactly `owner | staff`. Segment access values are exactly `commercial | domestic | both`. These match existing `check` constraints in `db/schema.sql`; never introduce a fourth value.
- Password minimum is 8 characters. Name is 1–60 characters after trimming.
- Every schema change goes in **both** `supabase/migrations/019_staff_management.sql` and `db/schema.sql`. `db/schema.sql` is the canonical fresh-build file; `supabase/schema.sql` and `supabase/fresh_setup.sql` are superseded and must **not** be touched.
- Edge Function responses carry the CORS header block on **every** path including errors, copied from `supabase/functions/send-bill-whatsapp/index.ts`.
- Tests are pure-function only. vitest runs with `environment: 'node'` — there is no DOM, no `localStorage`, no `sessionStorage`. Never write a test that mounts a component or touches browser storage.
- Tailwind classes follow the existing token names: `bg-cream`, `bg-surface`, `text-ink`, `text-muted`, `text-subtle`, `border-borderMuted`, `shadow-card`, `bg-accent`. Do not invent colours; the one raw hex in use for destructive text is `#C23B22` and for chevrons `#C0B4A2`.
- Commit after every task. Branch is `feat/staff-management`, already created.

## Review Focus

Five things the spec implies but does not cover with a test. Each has a test added to the task that owns the code.

1. **An auth user with no `profiles` row** hangs the app on a permanent "Loading…" screen — `ModeGate` returns early on `!profile` and never advances. The Edge Function's rollback prevents new ones, but a row could already be missing. Task 6 signs the session out with an explanation instead. (Test: Task 6, `signOutMessage('no-profile')`.)
2. **Email casing and whitespace.** `"Ramesh@Gmail.com "` and `"ramesh@gmail.com"` are the same login to GoTrue's uniqueness check only if normalised first; unnormalised, the owner gets a confusing 409 or a near-duplicate account. (Test: Task 3, `normalizeEmail` and `validateCreate`.)
3. **`set_active` on a user id that does not exist** — a stale roster on a second phone. Must be a readable 404, not a 500. (Test: Task 3, `validateSetActive` rejects a non-UUID; Task 4 maps the admin API error to 404.)
4. **Deactivating someone who is already inactive** (double tap, stale list). Must be a silent no-op, not an error and not a redundant ban call. (Test: Task 2, `wouldOrphanOwners` on an unchanged row; Task 4's early return.)
5. **Boundary values on validation:** a 7-character password, a 61-character name, a name that is only spaces. Off-by-one here either blocks a legitimate password or lets an empty name into a `not null` column. (Test: Task 3, each boundary asserted on both sides.)

---

## Task 1: Database migration

**Files:**
- Create: `supabase/migrations/019_staff_management.sql`
- Modify: `db/schema.sql` — profiles table block (line ~19), RLS profiles section (line ~290)

**Interfaces:**
- Consumes: nothing.
- Produces: `public.profiles.active boolean`; SQL function `public.is_active_owner(uid uuid default null) returns boolean`; policy `profiles_update_owner`; trigger `trg_profile_admin_rules`.

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/019_staff_management.sql`:

```sql
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

-- Postgres fires BEFORE row triggers in name order, so trg_profile_admin_rules
-- runs before trg_stamp_profiles. The guard reads only role / segment_access /
-- active, none of which stamp_audit touches, so the order does not matter --
-- noted so a future rename is not made blindly.
drop trigger if exists trg_profile_admin_rules on public.profiles;
create trigger trg_profile_admin_rules
  before insert or update on public.profiles
  for each row execute function public.enforce_profile_admin_rules();
```

- [ ] **Step 2: Mirror into the canonical schema**

In `db/schema.sql`, add `active` to the profiles table block so it reads:

```sql
create table if not exists public.profiles (
  id              uuid        primary key references auth.users(id) on delete cascade,
  name            text        not null,
  role            text        not null default 'staff' check (role in ('owner', 'staff')),
  segment_access  text        not null default 'both'  check (segment_access in ('commercial', 'domestic', 'both')),
  active          boolean     not null default true,
  created_at      timestamptz not null default now(),
  created_by      uuid,
  updated_at      timestamptz not null default now(),
  updated_by      uuid
);
```

Then paste the `is_active_owner` function, the `profiles_update_owner` policy, and the `enforce_profile_admin_rules` function plus its trigger into `db/schema.sql` — the function and policy directly after the existing `profiles_update_own` policy in the RLS section, and the trigger function alongside `enforce_whatsapp_enabled_owner_only` in the guard section above it. Copy the comments across verbatim; they are the reason the next reader will not "simplify" the definer function away.

- [ ] **Step 3: Apply the migration to the Supabase project**

Run the contents of `supabase/migrations/019_staff_management.sql` in the Supabase SQL editor for this project.

Expected: `Success. No rows returned.`

- [ ] **Step 4: Verify the guard rules by hand**

These rules are not reachable from vitest — there is no Postgres in the test environment. Run each in the SQL editor. Substitute real ids from `select id, name, role, active from profiles;`.

Six checks, each run as the named role. Use `set local role authenticated;` plus `set local request.jwt.claims = '{"sub":"<uuid>"}';` inside a transaction to impersonate a user, and `rollback` afterwards so nothing sticks:

```sql
-- 1. staff updating their own role -> rejected
begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"<staff-uuid>"}';
  update profiles set role = 'owner' where id = '<staff-uuid>';
rollback;
-- Expected: ERROR: only an owner can change role, segment access or active status
```

```sql
-- 2. owner demoting themselves -> rejected
begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"<owner-uuid>"}';
  update profiles set role = 'staff' where id = '<owner-uuid>';
rollback;
-- Expected: ERROR: you cannot change your own role
```

```sql
-- 3. owner deactivating themselves -> rejected
begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"<owner-uuid>"}';
  update profiles set active = false where id = '<owner-uuid>';
rollback;
-- Expected: ERROR: you cannot deactivate yourself
```

```sql
-- 4. demoting the last active owner (as the service role, bypassing RLS) -> rejected
begin;
  update profiles set role = 'staff' where id = '<the-only-owner-uuid>';
rollback;
-- Expected: ERROR: at least one active owner is required
```

```sql
-- 5. demoting an owner while a second active owner exists -> succeeds
-- Run only if there are two active owners; otherwise create the second inside
-- the transaction first, then rollback.
begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"<owner-a-uuid>"}';
  update profiles set role = 'staff' where id = '<owner-b-uuid>';
  select id, role from profiles where id = '<owner-b-uuid>';
rollback;
-- Expected: one row, role = 'staff'
```

```sql
-- 6. owner updating another profile's segment_access -> succeeds, updated_by stamped
begin;
  set local role authenticated;
  set local request.jwt.claims = '{"sub":"<owner-uuid>"}';
  update profiles set segment_access = 'domestic' where id = '<staff-uuid>';
  select segment_access, updated_by from profiles where id = '<staff-uuid>';
rollback;
-- Expected: segment_access = 'domestic', updated_by = <owner-uuid>
```

If check 1 instead fails with `infinite recursion detected in policy for relation "profiles"`, the `is_active_owner` function was created without `security definer` — fix that before continuing.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/019_staff_management.sql db/schema.sql
git commit -m "feat(db): active flag, owner update policy and profile guard trigger"
```

---

## Task 2: Types and staff display helpers

**Files:**
- Modify: `src/types/db.ts` — the `Profile` interface
- Create: `src/utils/staff.ts`
- Test: `src/utils/staff.test.ts`

**Interfaces:**
- Consumes: `Role`, `SegmentAccess` from `src/types/db.ts`.
- Produces:
  - `Profile` gains `active: boolean`, `updated_at: string`, `updated_by: string | null`
  - `roleLabel(role: Role): string`
  - `segmentLabel(s: SegmentAccess): string`
  - `sortStaff<T extends { name: string; active: boolean; id: string }>(rows: T[]): T[]`
  - `canEditOwnAccess(rowId: string, viewerId: string | undefined): boolean`
  - `wouldOrphanOwners(rows: Pick<Profile, 'id' | 'role' | 'active'>[], changingId: string, next: { role: Role; active: boolean }): boolean`
  - `staffErrorMessage(body: { error?: string; detail?: string } | null): string`

Note a deliberate departure from the spec's testing section: `validateNewStaff` does **not** live here. Input validation lives once, in the Edge Function (Task 3), and the client surfaces the 400 `detail` it returns. Duplicating the rules in two languages guarantees they drift.

- [ ] **Step 1: Extend the Profile type**

In `src/types/db.ts`, replace the `Profile` interface:

```ts
export interface Profile {
  id: string
  name: string
  role: Role
  segment_access: SegmentAccess
  active: boolean
  updated_at: string
  updated_by: string | null
}
```

- [ ] **Step 2: Write the failing tests**

Create `src/utils/staff.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import {
  roleLabel,
  segmentLabel,
  sortStaff,
  canEditOwnAccess,
  wouldOrphanOwners,
  staffErrorMessage,
} from './staff'

describe('roleLabel', () => {
  it('capitalises the stored value', () => {
    expect(roleLabel('owner')).toBe('Owner')
    expect(roleLabel('staff')).toBe('Staff')
  })
})

describe('segmentLabel', () => {
  it('names each segment the way the header does', () => {
    expect(segmentLabel('commercial')).toBe('Commercial')
    expect(segmentLabel('domestic')).toBe('Domestic')
    expect(segmentLabel('both')).toBe('Both sides')
  })
})

describe('sortStaff', () => {
  const row = (id: string, name: string, active: boolean) => ({ id, name, active })

  it('puts active members before inactive ones', () => {
    const out = sortStaff([row('a', 'Zara', false), row('b', 'Amit', true)])
    expect(out.map((r) => r.id)).toEqual(['b', 'a'])
  })

  it('sorts by name within each group', () => {
    const out = sortStaff([
      row('a', 'Ramesh', true),
      row('b', 'Amit', true),
      row('c', 'Zara', false),
      row('d', 'Bala', false),
    ])
    expect(out.map((r) => r.name)).toEqual(['Amit', 'Ramesh', 'Bala', 'Zara'])
  })

  it('ignores case when comparing names', () => {
    const out = sortStaff([row('a', 'bala', true), row('b', 'Amit', true)])
    expect(out.map((r) => r.name)).toEqual(['Amit', 'bala'])
  })

  it('falls back to id so equal names keep a stable order', () => {
    const out = sortStaff([row('b', 'Amit', true), row('a', 'Amit', true)])
    expect(out.map((r) => r.id)).toEqual(['a', 'b'])
  })

  it('does not mutate the input', () => {
    const input = [row('a', 'Zara', false), row('b', 'Amit', true)]
    sortStaff(input)
    expect(input.map((r) => r.id)).toEqual(['a', 'b'])
  })
})

describe('canEditOwnAccess', () => {
  it('is false for your own row', () => {
    expect(canEditOwnAccess('u1', 'u1')).toBe(false)
  })

  it('is true for somebody else', () => {
    expect(canEditOwnAccess('u2', 'u1')).toBe(true)
  })

  it('is false when the viewer is unknown', () => {
    expect(canEditOwnAccess('u2', undefined)).toBe(false)
  })
})

describe('wouldOrphanOwners', () => {
  const rows = [
    { id: 'o1', role: 'owner' as const, active: true },
    { id: 'o2', role: 'owner' as const, active: false },
    { id: 's1', role: 'staff' as const, active: true },
  ]

  it('blocks demoting the only active owner', () => {
    expect(wouldOrphanOwners(rows, 'o1', { role: 'staff', active: true })).toBe(true)
  })

  it('blocks deactivating the only active owner', () => {
    expect(wouldOrphanOwners(rows, 'o1', { role: 'owner', active: false })).toBe(true)
  })

  it('does not count an inactive owner as cover', () => {
    const twoOwnersOneInactive = [
      { id: 'o1', role: 'owner' as const, active: true },
      { id: 'o2', role: 'owner' as const, active: false },
    ]
    expect(wouldOrphanOwners(twoOwnersOneInactive, 'o1', { role: 'staff', active: true })).toBe(true)
  })

  it('allows demoting one of two active owners', () => {
    const twoActive = [
      { id: 'o1', role: 'owner' as const, active: true },
      { id: 'o2', role: 'owner' as const, active: true },
    ]
    expect(wouldOrphanOwners(twoActive, 'o1', { role: 'staff', active: true })).toBe(false)
  })

  it('allows a change that leaves the only owner an owner', () => {
    expect(wouldOrphanOwners(rows, 'o1', { role: 'owner', active: true })).toBe(false)
  })

  it('allows changing a staff member while one owner exists', () => {
    expect(wouldOrphanOwners(rows, 's1', { role: 'staff', active: false })).toBe(false)
  })

  it('treats deactivating an already-inactive member as harmless', () => {
    expect(wouldOrphanOwners(rows, 'o2', { role: 'owner', active: false })).toBe(false)
  })
})

describe('staffErrorMessage', () => {
  it('prefers the detail the function sent', () => {
    expect(staffErrorMessage({ error: 'forbidden', detail: 'you cannot deactivate yourself' }))
      .toBe('you cannot deactivate yourself')
  })

  it('has a sentence for every code, detail or not', () => {
    expect(staffErrorMessage({ error: 'unauthorized' })).toBe('Your session has expired. Sign in again.')
    expect(staffErrorMessage({ error: 'forbidden' })).toBe('Only an owner can do this.')
    expect(staffErrorMessage({ error: 'invalid_request' })).toBe('Check the details and try again.')
    expect(staffErrorMessage({ error: 'email_taken' })).toBe('That email already has a login.')
    expect(staffErrorMessage({ error: 'not_found' })).toBe('That person is no longer on the roster. Pull to refresh.')
  })

  it('falls back for an unknown code or a missing body', () => {
    expect(staffErrorMessage({ error: 'teapot' })).toBe('Something went wrong. Try again.')
    expect(staffErrorMessage(null)).toBe('Something went wrong. Try again.')
  })
})
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npx vitest run src/utils/staff.test.ts`
Expected: FAIL — `Failed to resolve import "./staff"`.

- [ ] **Step 4: Write the implementation**

Create `src/utils/staff.ts`:

```ts
import type { Profile, Role, SegmentAccess } from '../types/db'

export const ROLES: Role[] = ['owner', 'staff']
export const SEGMENTS: SegmentAccess[] = ['commercial', 'domestic', 'both']

export function roleLabel(role: Role): string {
  return role === 'owner' ? 'Owner' : 'Staff'
}

export function segmentLabel(s: SegmentAccess): string {
  if (s === 'both') return 'Both sides'
  return s === 'commercial' ? 'Commercial' : 'Domestic'
}

// Active first, then by name. The id tiebreak keeps two people with the same
// name in a fixed order across refreshes, so rows do not swap under a thumb.
export function sortStaff<T extends { id: string; name: string; active: boolean }>(rows: T[]): T[] {
  return [...rows].sort((a, b) => {
    if (a.active !== b.active) return a.active ? -1 : 1
    const byName = a.name.localeCompare(b.name, 'en', { sensitivity: 'base' })
    return byName !== 0 ? byName : a.id.localeCompare(b.id)
  })
}

// Role, segment access and the active toggle are locked on your own row: the
// database rejects those changes, and a disabled control explains why better
// than a raised exception.
export function canEditOwnAccess(rowId: string, viewerId: string | undefined): boolean {
  return viewerId !== undefined && rowId !== viewerId
}

// Mirrors the "at least one active owner" rule in enforce_profile_admin_rules,
// so the form can refuse before the round trip. An inactive owner is not cover:
// they cannot sign in to undo the change.
export function wouldOrphanOwners(
  rows: Pick<Profile, 'id' | 'role' | 'active'>[],
  changingId: string,
  next: { role: Role; active: boolean },
): boolean {
  const othersCovering = rows.some((r) => r.id !== changingId && r.role === 'owner' && r.active)
  if (othersCovering) return false
  const wasCovering = rows.some((r) => r.id === changingId && r.role === 'owner' && r.active)
  if (!wasCovering) return false
  return !(next.role === 'owner' && next.active)
}

const FALLBACK = 'Something went wrong. Try again.'

export function staffErrorMessage(body: { error?: string; detail?: string } | null): string {
  if (!body?.error) return FALLBACK
  if (body.detail) return body.detail
  switch (body.error) {
    case 'unauthorized':
      return 'Your session has expired. Sign in again.'
    case 'forbidden':
      return 'Only an owner can do this.'
    case 'invalid_request':
      return 'Check the details and try again.'
    case 'email_taken':
      return 'That email already has a login.'
    case 'not_found':
      return 'That person is no longer on the roster. Pull to refresh.'
    default:
      return FALLBACK
  }
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run src/utils/staff.test.ts`
Expected: PASS, 20 tests.

- [ ] **Step 6: Commit**

```bash
git add src/types/db.ts src/utils/staff.ts src/utils/staff.test.ts
git commit -m "feat(staff): profile active flag and roster display helpers"
```

---

## Task 3: Edge Function input validation

**Files:**
- Create: `supabase/functions/manage-staff/validation.ts`
- Test: `supabase/functions/manage-staff/validation.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `type Validated<T> = { ok: true; value: T } | { ok: false; detail: string }`
  - `normalizeEmail(raw: string): string`
  - `validateCreate(body: unknown): Validated<CreateInput>` where `CreateInput = { name: string; email: string; password: string; role: Role; segment_access: SegmentAccess }`
  - `validateSetActive(body: unknown): Validated<{ user_id: string; active: boolean }>`

This module has no imports and no network calls, which is why vitest can run a Deno-targeted file unchanged — the same arrangement `supabase/functions/send-bill-whatsapp/templates.ts` and `whatsapp-status/statuses.ts` already use.

- [ ] **Step 1: Write the failing tests**

Create `supabase/functions/manage-staff/validation.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { normalizeEmail, validateCreate, validateSetActive } from './validation'

const valid = {
  action: 'create',
  name: 'Ramesh Kumar',
  email: 'ramesh@example.com',
  password: 'cylinder8',
  role: 'staff',
  segment_access: 'both',
}

const detail = (r: ReturnType<typeof validateCreate>) => (r.ok ? '' : r.detail)

describe('normalizeEmail', () => {
  it('trims and lowercases', () => {
    expect(normalizeEmail('  Ramesh@Gmail.COM ')).toBe('ramesh@gmail.com')
  })

  it('leaves an already-clean address alone', () => {
    expect(normalizeEmail('ramesh@gmail.com')).toBe('ramesh@gmail.com')
  })
})

describe('validateCreate', () => {
  it('accepts a well-formed body', () => {
    const r = validateCreate(valid)
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.value).toEqual({
        name: 'Ramesh Kumar',
        email: 'ramesh@example.com',
        password: 'cylinder8',
        role: 'staff',
        segment_access: 'both',
      })
    }
  })

  it('normalises the email it returns', () => {
    const r = validateCreate({ ...valid, email: '  Ramesh@Example.COM ' })
    expect(r.ok && r.value.email).toBe('ramesh@example.com')
  })

  it('trims the name it returns', () => {
    const r = validateCreate({ ...valid, name: '  Ramesh  ' })
    expect(r.ok && r.value.name).toBe('Ramesh')
  })

  it('rejects a non-object body', () => {
    expect(validateCreate(null).ok).toBe(false)
    expect(validateCreate('create').ok).toBe(false)
  })

  it('rejects an empty or whitespace-only name', () => {
    expect(detail(validateCreate({ ...valid, name: '' }))).toBe('Enter a name')
    expect(detail(validateCreate({ ...valid, name: '   ' }))).toBe('Enter a name')
  })

  it('accepts a 60-character name and rejects 61', () => {
    expect(validateCreate({ ...valid, name: 'a'.repeat(60) }).ok).toBe(true)
    expect(detail(validateCreate({ ...valid, name: 'a'.repeat(61) }))).toBe('Name is too long')
  })

  it('rejects a malformed email', () => {
    expect(detail(validateCreate({ ...valid, email: 'ramesh' }))).toBe('Enter a valid email address')
    expect(detail(validateCreate({ ...valid, email: 'ramesh@' }))).toBe('Enter a valid email address')
    expect(detail(validateCreate({ ...valid, email: '@example.com' }))).toBe('Enter a valid email address')
    expect(detail(validateCreate({ ...valid, email: 'ramesh@example' }))).toBe('Enter a valid email address')
    expect(detail(validateCreate({ ...valid, email: 'ram esh@example.com' }))).toBe('Enter a valid email address')
    expect(detail(validateCreate({ ...valid, email: 'a@b@example.com' }))).toBe('Enter a valid email address')
  })

  it('accepts an 8-character password and rejects 7', () => {
    expect(validateCreate({ ...valid, password: '12345678' }).ok).toBe(true)
    expect(detail(validateCreate({ ...valid, password: '1234567' })))
      .toBe('Password must be at least 8 characters')
  })

  it('does not trim the password', () => {
    const r = validateCreate({ ...valid, password: ' pass123 ' })
    expect(r.ok && r.value.password).toBe(' pass123 ')
  })

  it('rejects an unknown role', () => {
    expect(detail(validateCreate({ ...valid, role: 'admin' }))).toBe('Pick a role')
    expect(detail(validateCreate({ ...valid, role: undefined }))).toBe('Pick a role')
  })

  it('rejects an unknown segment access', () => {
    expect(detail(validateCreate({ ...valid, segment_access: 'all' }))).toBe('Pick a segment')
  })

  it('accepts every valid role and segment combination', () => {
    for (const role of ['owner', 'staff']) {
      for (const segment_access of ['commercial', 'domestic', 'both']) {
        expect(validateCreate({ ...valid, role, segment_access }).ok).toBe(true)
      }
    }
  })
})

describe('validateSetActive', () => {
  const id = '3f1c2b8a-9d44-4e21-8b77-0a1b2c3d4e5f'

  it('accepts a uuid and a boolean', () => {
    const r = validateSetActive({ action: 'set_active', user_id: id, active: false })
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.value).toEqual({ user_id: id, active: false })
  })

  it('rejects a non-uuid user id', () => {
    const r = validateSetActive({ action: 'set_active', user_id: '42', active: true })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.detail).toBe('Unknown user')
  })

  it('rejects a missing user id', () => {
    expect(validateSetActive({ action: 'set_active', active: true }).ok).toBe(false)
  })

  it('rejects a non-boolean active', () => {
    const r = validateSetActive({ action: 'set_active', user_id: id, active: 'false' })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.detail).toBe('Active must be true or false')
  })

  it('rejects a non-object body', () => {
    expect(validateSetActive(null).ok).toBe(false)
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run supabase/functions/manage-staff/validation.test.ts`
Expected: FAIL — `Failed to resolve import "./validation"`.

- [ ] **Step 3: Write the implementation**

Create `supabase/functions/manage-staff/validation.ts`:

```ts
// Pure input validation for the manage-staff function. No imports and no
// network calls, so vitest can run this Deno-targeted file unchanged --
// the arrangement templates.ts and statuses.ts already use.

export type Role = 'owner' | 'staff'
export type SegmentAccess = 'commercial' | 'domestic' | 'both'

export interface CreateInput {
  name: string
  email: string
  password: string
  role: Role
  segment_access: SegmentAccess
}

export type Validated<T> = { ok: true; value: T } | { ok: false; detail: string }

const NAME_MAX = 60
const PASSWORD_MIN = 8
const ROLES: Role[] = ['owner', 'staff']
const SEGMENTS: SegmentAccess[] = ['commercial', 'domestic', 'both']

// Deliberately loose: GoTrue is the real authority on what it will accept.
// This only catches the shapes that are obviously not an address, so the owner
// gets a sentence instead of a 422 from the auth API.
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function normalizeEmail(raw: string): string {
  return raw.trim().toLowerCase()
}

function asRecord(body: unknown): Record<string, unknown> | null {
  return typeof body === 'object' && body !== null ? (body as Record<string, unknown>) : null
}

const fail = (detail: string): Validated<never> => ({ ok: false, detail })

export function validateCreate(body: unknown): Validated<CreateInput> {
  const b = asRecord(body)
  if (!b) return fail('Malformed request')

  const name = typeof b.name === 'string' ? b.name.trim() : ''
  if (!name) return fail('Enter a name')
  if (name.length > NAME_MAX) return fail('Name is too long')

  const email = typeof b.email === 'string' ? normalizeEmail(b.email) : ''
  if (!EMAIL.test(email)) return fail('Enter a valid email address')

  // Not trimmed: a leading or trailing space is a legitimate part of a
  // password, and silently stripping it locks the user out of their own login.
  const password = typeof b.password === 'string' ? b.password : ''
  if (password.length < PASSWORD_MIN) return fail(`Password must be at least ${PASSWORD_MIN} characters`)

  const role = b.role as Role
  if (!ROLES.includes(role)) return fail('Pick a role')

  const segment_access = b.segment_access as SegmentAccess
  if (!SEGMENTS.includes(segment_access)) return fail('Pick a segment')

  return { ok: true, value: { name, email, password, role, segment_access } }
}

export function validateSetActive(body: unknown): Validated<{ user_id: string; active: boolean }> {
  const b = asRecord(body)
  if (!b) return fail('Malformed request')

  const user_id = typeof b.user_id === 'string' ? b.user_id : ''
  if (!UUID.test(user_id)) return fail('Unknown user')

  if (typeof b.active !== 'boolean') return fail('Active must be true or false')

  return { ok: true, value: { user_id, active: b.active } }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run supabase/functions/manage-staff/validation.test.ts`
Expected: PASS, 19 tests.

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/manage-staff/validation.ts supabase/functions/manage-staff/validation.test.ts
git commit -m "feat(staff): input validation for the manage-staff function"
```

---

## Task 4: Edge Function handler

**Files:**
- Create: `supabase/functions/manage-staff/index.ts`
- Reference: `supabase/functions/send-bill-whatsapp/index.ts` (CORS block, auth check, client setup)

**Interfaces:**
- Consumes: `validateCreate`, `validateSetActive`, `Validated` from `./validation.ts` (Task 3).
- Produces: `POST /functions/v1/manage-staff` accepting `{ action: 'create', … }` and `{ action: 'set_active', user_id, active }`, responding per the table below.

| Status | Body | Cause |
|---|---|---|
| 200 | `{ ok: true, user_id }` | created |
| 200 | `{ ok: true }` | activation changed, or already in the requested state |
| 400 | `{ error: 'invalid_request', detail }` | validation failed |
| 401 | `{ error: 'unauthorized' }` | no or bad session |
| 403 | `{ error: 'forbidden', detail }` | caller not an active owner; self-deactivate; last owner |
| 404 | `{ error: 'not_found' }` | `user_id` has no profile |
| 405 | `{ error: 'method_not_allowed' }` | not POST |
| 409 | `{ error: 'email_taken' }` | address already registered |
| 500 | `{ error: 'server_error' }` | unexpected |

- [ ] **Step 1: Write the handler**

Create `supabase/functions/manage-staff/index.ts`:

```ts
import { createClient } from 'jsr:@supabase/supabase-js@2'
import { validateCreate, validateSetActive } from './validation.ts'

// 100 years. GoTrue takes a duration string, not a flag -- 'none' lifts it.
const BAN_FOREVER = '876000h'

// supabase.functions.invoke() sends Authorization + Content-Type, which makes
// this a non-simple cross-origin request -- the browser preflights it with
// OPTIONS before the real POST. Without these headers on every response
// (including error paths) the gateway never sees the actual request.
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405)

  // The caller must be a signed-in app user. Without this check anyone who
  // discovers the URL could create themselves an owner login.
  const authHeader = req.headers.get('Authorization') ?? ''
  const anon = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authHeader } } },
  )
  const { data: userData, error: userError } = await anon.auth.getUser()
  if (userError || !userData?.user) return json({ error: 'unauthorized' }, 401)
  const callerId = userData.user.id

  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false } },
  )

  // Owner-ness is read with the service-role key rather than trusted from the
  // JWT: role lives in profiles, not in the token, so a stale token from
  // before a demotion would otherwise still pass.
  const { data: caller, error: callerError } = await admin
    .from('profiles')
    .select('id, role, active')
    .eq('id', callerId)
    .single()
  if (callerError || !caller) return json({ error: 'forbidden', detail: 'Your profile is not set up.' }, 403)
  if (caller.role !== 'owner' || !caller.active) {
    return json({ error: 'forbidden', detail: 'Only an owner can manage staff.' }, 403)
  }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return json({ error: 'invalid_request', detail: 'Malformed request' }, 400)
  }

  const action = (body as { action?: unknown })?.action
  if (action === 'create') return handleCreate(admin, callerId, body)
  if (action === 'set_active') return handleSetActive(admin, callerId, body)
  return json({ error: 'invalid_request', detail: 'Unknown action' }, 400)

  // deno-lint-ignore no-explicit-any
  async function handleCreate(admin: any, callerId: string, body: unknown): Promise<Response> {
    const parsed = validateCreate(body)
    if (!parsed.ok) return json({ error: 'invalid_request', detail: parsed.detail }, 400)
    const input = parsed.value

    // email_confirm: true because no mail is being sent -- an unconfirmed user
    // cannot sign in, and the owner hands the password over in person.
    const { data: created, error: createError } = await admin.auth.admin.createUser({
      email: input.email,
      password: input.password,
      email_confirm: true,
      user_metadata: { name: input.name },
    })

    if (createError || !created?.user) {
      const message = createError?.message ?? ''
      if (createError?.status === 422 || /already (been )?registered|already exists/i.test(message)) {
        return json({ error: 'email_taken' }, 409)
      }
      console.error('createUser failed:', message)
      return json({ error: 'server_error' }, 500)
    }

    const newId = created.user.id

    // db/schema.sql v4 has no handle_new_user trigger, so creating the auth
    // user leaves no profiles row behind and this insert is what creates it.
    // Written as an upsert because the live database may still carry the
    // legacy trigger from fresh_setup.sql, which would have inserted a
    // role='staff' row a moment ago. created_by / updated_by are passed
    // explicitly: stamp_audit reads auth.uid(), which is null under the
    // service-role key.
    const { error: profileError } = await admin
      .from('profiles')
      .upsert(
        {
          id: newId,
          name: input.name,
          role: input.role,
          segment_access: input.segment_access,
          active: true,
          created_by: callerId,
          updated_by: callerId,
        },
        { onConflict: 'id' },
      )

    if (profileError) {
      // Without this rollback a failed insert strands an auth user who can
      // sign in with no profile row, which ModeGate renders as a permanent
      // loading screen.
      await admin.auth.admin.deleteUser(newId)
      console.error('profile upsert failed, rolled back auth user:', profileError.message)
      return json({ error: 'server_error' }, 500)
    }

    return json({ ok: true, user_id: newId })
  }

  // deno-lint-ignore no-explicit-any
  async function handleSetActive(admin: any, callerId: string, body: unknown): Promise<Response> {
    const parsed = validateSetActive(body)
    if (!parsed.ok) return json({ error: 'invalid_request', detail: parsed.detail }, 400)
    const { user_id, active } = parsed.value

    if (user_id === callerId) {
      return json({ error: 'forbidden', detail: 'You cannot deactivate yourself.' }, 403)
    }

    const { data: target, error: targetError } = await admin
      .from('profiles')
      .select('id, role, active')
      .eq('id', user_id)
      .maybeSingle()
    if (targetError) {
      console.error('target lookup failed:', targetError.message)
      return json({ error: 'server_error' }, 500)
    }
    if (!target) return json({ error: 'not_found' }, 404)

    // Idempotent: a double tap or a stale roster must not fire a redundant ban.
    if (target.active === active) return json({ ok: true })

    if (!active && target.role === 'owner') {
      const { count, error: countError } = await admin
        .from('profiles')
        .select('id', { count: 'exact', head: true })
        .eq('role', 'owner')
        .eq('active', true)
        .neq('id', user_id)
      if (countError) {
        console.error('owner count failed:', countError.message)
        return json({ error: 'server_error' }, 500)
      }
      if (!count) {
        return json({ error: 'forbidden', detail: 'At least one active owner is required.' }, 403)
      }
    }

    // The ban goes first on purpose. If the profiles update then fails, the
    // user is banned but still listed as active -- visibly wrong and safe. The
    // reverse order would show them deactivated while their session kept
    // working.
    const { error: banError } = await admin.auth.admin.updateUserById(user_id, {
      ban_duration: active ? 'none' : BAN_FOREVER,
    })
    if (banError) {
      console.error('ban update failed:', banError.message)
      return json({ error: 'server_error' }, 500)
    }

    const { error: flagError } = await admin
      .from('profiles')
      .update({ active, updated_by: callerId })
      .eq('id', user_id)
    if (flagError) {
      console.error('active flag update failed:', flagError.message)
      return json({ error: 'server_error' }, 500)
    }

    return json({ ok: true })
  }
})
```

- [ ] **Step 2: Verify the validation tests still pass**

Adding `index.ts` beside the tested module must not disturb it.

Run: `npx vitest run supabase/functions/manage-staff/validation.test.ts`
Expected: PASS, 19 tests.

- [ ] **Step 3: Deploy the function**

```bash
npx supabase functions deploy manage-staff
```

Expected: `Deployed Functions on project …: manage-staff`.

`SUPABASE_URL`, `SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY` are injected by the platform — no secrets to set.

- [ ] **Step 4: Commit**

```bash
git add supabase/functions/manage-staff/index.ts
git commit -m "feat(staff): manage-staff edge function for create and deactivate"
```

---

## Task 5: Client wrapper for the function

**Files:**
- Create: `src/lib/staffAdmin.ts`

**Interfaces:**
- Consumes: `supabase` from `src/lib/supabase.ts`; `Role`, `SegmentAccess` from `src/types/db.ts`.
- Produces:
  - `type StaffFnError = { error: string; detail?: string }`
  - `type StaffResult<T> = { ok: true; value: T } | { ok: false; error: StaffFnError }`
  - `createStaff(input: { name: string; email: string; password: string; role: Role; segment_access: SegmentAccess }): Promise<StaffResult<{ user_id: string }>>`
  - `setStaffActive(userId: string, active: boolean): Promise<StaffResult<Record<string, never>>>`

No test: this file is pure IO. The part worth testing — turning an error body into a sentence — is `staffErrorMessage` in Task 2.

- [ ] **Step 1: Write the wrapper**

Create `src/lib/staffAdmin.ts`:

```ts
import { supabase } from './supabase'
import type { Role, SegmentAccess } from '../types/db'

export interface StaffFnError {
  error: string
  detail?: string
}

export type StaffResult<T> = { ok: true; value: T } | { ok: false; error: StaffFnError }

// supabase-js does not throw on a non-2xx from a function; it returns a
// FunctionsHttpError whose .context is the raw Response. The function's own
// { error, detail } body is in there, and it is the only place the reason for
// a 403 survives -- error.message is just "Edge Function returned a non-2xx
// status code".
async function call<T>(body: Record<string, unknown>): Promise<StaffResult<T>> {
  const { data, error } = await supabase.functions.invoke('manage-staff', { body })

  if (error) {
    const context = (error as { context?: Response }).context
    if (context && typeof context.json === 'function') {
      try {
        return { ok: false, error: (await context.json()) as StaffFnError }
      } catch {
        // Body was not JSON (a gateway error page). Fall through.
      }
    }
    return { ok: false, error: { error: 'server_error' } }
  }

  return { ok: true, value: data as T }
}

export function createStaff(input: {
  name: string
  email: string
  password: string
  role: Role
  segment_access: SegmentAccess
}): Promise<StaffResult<{ user_id: string }>> {
  return call<{ user_id: string }>({ action: 'create', ...input })
}

export function setStaffActive(userId: string, active: boolean): Promise<StaffResult<Record<string, never>>> {
  return call<Record<string, never>>({ action: 'set_active', user_id: userId, active })
}
```

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc -b`
Expected: no output (success).

- [ ] **Step 3: Commit**

```bash
git add src/lib/staffAdmin.ts
git commit -m "feat(staff): typed client wrapper for manage-staff"
```

---

## Task 6: Sign out a deactivated session

**Files:**
- Create: `src/auth/signOutReason.ts`
- Test: `src/auth/signOutReason.test.ts`
- Modify: `src/auth/AuthContext.tsx` — the profile-loading effect
- Modify: `src/pages/Login.tsx` — error display

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `type SignOutReason = 'inactive' | 'no-profile'`
  - `setSignOutReason(reason: SignOutReason): void`
  - `takeSignOutReason(): SignOutReason | null` (reads and clears)
  - `signOutMessage(reason: SignOutReason): string`

- [ ] **Step 1: Write the failing test**

Create `src/auth/signOutReason.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { signOutMessage } from './signOutReason'

describe('signOutMessage', () => {
  it('explains a deactivated account without blaming the user', () => {
    expect(signOutMessage('inactive'))
      .toBe('Your access has been turned off. Ask the owner to turn it back on.')
  })

  it('explains a login with no profile row', () => {
    expect(signOutMessage('no-profile'))
      .toBe('Your login is not set up yet. Ask the owner to add you again.')
  })
})
```

Only `signOutMessage` is tested. `setSignOutReason` and `takeSignOutReason` touch `sessionStorage`, which does not exist under vitest's `node` environment — they are written defensively instead (see Step 3).

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/auth/signOutReason.test.ts`
Expected: FAIL — `Failed to resolve import "./signOutReason"`.

- [ ] **Step 3: Write the implementation**

Create `src/auth/signOutReason.ts`:

```ts
// Carries the reason for an involuntary sign-out from AuthContext across the
// redirect to /login. sessionStorage rather than router state because the
// sign-out is triggered from an effect, not from a navigation.

const KEY = 'cylinder-tracker-signout-reason'

export type SignOutReason = 'inactive' | 'no-profile'

export function setSignOutReason(reason: SignOutReason): void {
  try {
    sessionStorage.setItem(KEY, reason)
  } catch {
    // Private mode, or no storage at all. The user lands on the login screen
    // without an explanation, which is the pre-existing behaviour.
  }
}

export function takeSignOutReason(): SignOutReason | null {
  try {
    const value = sessionStorage.getItem(KEY)
    if (value) sessionStorage.removeItem(KEY)
    return value === 'inactive' || value === 'no-profile' ? value : null
  } catch {
    return null
  }
}

export function signOutMessage(reason: SignOutReason): string {
  return reason === 'inactive'
    ? 'Your access has been turned off. Ask the owner to turn it back on.'
    : 'Your login is not set up yet. Ask the owner to add you again.'
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/auth/signOutReason.test.ts`
Expected: PASS, 2 tests.

- [ ] **Step 5: Wire it into AuthContext**

In `src/auth/AuthContext.tsx`, add the import:

```ts
import { setSignOutReason } from './signOutReason'
```

Replace the profile-loading effect body with:

```ts
  useEffect(() => {
    if (!session) return
    let cancelled = false
    setLoading(true)
    supabase
      .from('profiles')
      .select('id, name, role, segment_access, active, updated_at, updated_by')
      .eq('id', session.user.id)
      .single()
      .then(({ data, error }) => {
        if (cancelled) return
        if (error) console.error('Failed to load profile:', error.message)
        const loaded = data as Profile | null

        // A signed-in user with no profile row hangs ModeGate on its loading
        // branch forever. A deactivated one is already banned in GoTrue, but
        // their current access token stays valid until it expires -- signing
        // out here clears the screen now rather than at the next refresh.
        if (!loaded || !loaded.active) {
          setSignOutReason(loaded ? 'inactive' : 'no-profile')
          setProfile(null)
          setLoading(false)
          void supabase.auth.signOut()
          return
        }

        setProfile(loaded)
        setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [session])
```

- [ ] **Step 6: Show the reason on the login screen**

In `src/pages/Login.tsx`, add the import:

```ts
import { takeSignOutReason, signOutMessage } from '../auth/signOutReason'
```

Add this directly after the existing `useState` declarations:

```ts
  // Read once on mount, before the early `if (session)` return can skip it.
  const [notice] = useState(() => {
    const reason = takeSignOutReason()
    return reason ? signOutMessage(reason) : null
  })
```

Replace the existing error paragraph with:

```tsx
          {(error || notice) && (
            <p className="rounded-xl bg-[#FBE9E4] px-4 py-3 text-sm font-semibold text-[#C23B22]">
              {error ?? notice}
            </p>
          )}
```

And in `handleSubmit`, translate GoTrue's ban message into the app's wording:

```ts
    const { error } = await signIn(email, password)
    setSubmitting(false)
    if (error) {
      setError(/banned|blocked/i.test(error) ? signOutMessage('inactive') : error)
    }
```

- [ ] **Step 7: Verify the whole suite and the build**

Run: `npm test && npx tsc -b`
Expected: all test files pass; `tsc` prints nothing.

- [ ] **Step 8: Commit**

```bash
git add src/auth/signOutReason.ts src/auth/signOutReason.test.ts src/auth/AuthContext.tsx src/pages/Login.tsx
git commit -m "feat(auth): sign out a deactivated or profile-less session with a reason"
```

---

## Task 7: Staff roster hook

**Files:**
- Create: `src/hooks/useStaff.ts`

**Interfaces:**
- Consumes: `supabase`; `Profile` from `src/types/db.ts`.
- Produces: `useStaff(): { staff: Profile[]; loading: boolean; error: string | null; refresh: () => Promise<void> }`

Shaped after `useAgencySettings`, which is the hook pattern this codebase uses for a settings read with a manual refresh.

- [ ] **Step 1: Write the hook**

Create `src/hooks/useStaff.ts`:

```ts
import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { Profile } from '../types/db'

// The full roster, owner-only in the UI. profiles_read is `using (true)`, so
// the read itself is not gated -- see decision 5 in the design: useProfiles()
// depends on every user being able to resolve created_by into a name.
export function useStaff() {
  const [staff, setStaff] = useState<Profile[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('profiles')
      .select('id, name, role, segment_access, active, updated_at, updated_by')
      .order('name')
    if (error) setError(error.message)
    else {
      setError(null)
      setStaff((data ?? []) as Profile[])
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh])

  return { staff, loading, error, refresh }
}
```

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc -b`
Expected: no output.

- [ ] **Step 3: Commit**

```bash
git add src/hooks/useStaff.ts
git commit -m "feat(staff): roster hook"
```

---

## Task 8: Owner route guard and the Account page

**Files:**
- Create: `src/components/OwnerRoute.tsx`
- Create: `src/pages/Account.tsx`
- Delete: `src/components/AccountMenu.tsx`
- Modify: `src/components/AppHeader.tsx` — drop the `onOpenAccount` prop
- Modify: `src/App.tsx` — routes
- Modify (11 files, mechanical): `src/pages/Home.tsx`, `src/pages/Customers.tsx`, `src/pages/ActivityFeed.tsx`, `src/pages/Purchases.tsx`, `src/pages/Reports.tsx`, `src/pages/AllStock.tsx`, `src/pages/Godown.tsx`, `src/pages/domestic/DomesticHome.tsx`, `src/pages/domestic/DomesticHistory.tsx`, `src/pages/domestic/DomesticPurchases.tsx`, `src/pages/domestic/DomesticStock.tsx`

**Interfaces:**
- Consumes: `useAuth`; `useAgencySettings`; `InitialsBadge`; `ChevronLeftIcon`.
- Produces: `<OwnerRoute />` (an `<Outlet />` guard); `<Account />` at `/account`.

- [ ] **Step 1: Write the owner guard**

Create `src/components/OwnerRoute.tsx`:

```tsx
import { Navigate, Outlet } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'

// Owner-only screens. The data behind them is already gated in the database;
// this stops a staff member who typed the URL from landing on a page of errors.
export function OwnerRoute() {
  const { profile, loading } = useAuth()

  if (loading) {
    return <div className="flex h-screen items-center justify-center text-ink">Loading…</div>
  }

  if (profile?.role !== 'owner') {
    return <Navigate to="/account" replace />
  }

  return <Outlet />
}
```

- [ ] **Step 2: Write the Account page**

Create `src/pages/Account.tsx`:

```tsx
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { useAgencySettings } from '../hooks/useAgencySettings'
import { InitialsBadge } from '../components/InitialsBadge'
import { ChevronLeftIcon } from '../components/icons'

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)
const rowCls =
  'flex items-center justify-between rounded-[16px] bg-surface px-[18px] py-[17px] text-[14.5px] font-bold text-ink shadow-card'

export function Account() {
  const { profile, signOut } = useAuth()
  const { data } = useAgencySettings()
  const navigate = useNavigate()
  const isOwner = profile?.role === 'owner'

  return (
    <div className="p-4">
      {/* navigate(-1), not a link to "/": this page is reached from both the
          commercial and the domestic side. */}
      <button
        onClick={() => navigate(-1)}
        className="mb-3 inline-flex items-center gap-[6px] py-[6px] text-sm font-bold text-muted"
      >
        <ChevronLeftIcon size={18} /> Back
      </button>

      <div className="mb-6 flex items-center gap-3">
        <InitialsBadge name={profile?.name ?? '?'} size={60} radius={18} />
        <div className="min-w-0">
          <p className="truncate font-display text-[22px] font-bold tracking-[-0.4px] text-ink">
            {profile?.name}
          </p>
          <p className="text-[12.5px] font-semibold text-muted">
            {data?.business_name || 'Cylinder Tracker'}
            {profile?.role ? ` · ${cap(profile.role)}` : ''}
          </p>
        </div>
      </div>

      <div className="space-y-[10px]">
        {isOwner && (
          <Link to="/commercial/reports" className={rowCls}>
            Reports <span className="text-[#C0B4A2]">›</span>
          </Link>
        )}
        {isOwner && (
          <Link to="/account/staff" className={rowCls}>
            Staff <span className="text-[#C0B4A2]">›</span>
          </Link>
        )}
        {/* Products and prices are edited from the Godown / Stock screen. */}
        <Link to="/account/business" className={rowCls}>
          Business details <span className="text-[#C0B4A2]">›</span>
        </Link>
      </div>

      <button
        onClick={signOut}
        className="mt-6 h-[52px] w-full rounded-[16px] border-[1.5px] border-borderMuted bg-surface text-[15px] font-bold"
        style={{ color: '#C23B22' }}
      >
        Sign out
      </button>
    </div>
  )
}
```

- [ ] **Step 3: Make AppHeader navigate on its own**

In `src/components/AppHeader.tsx`, change the signature and the account button. The `onOpenAccount` prop goes away entirely:

```tsx
export function AppHeader({ view, title }: { view: HeaderView; title?: string }) {
```

```tsx
        <button onClick={() => navigate('/account')} aria-label="Account">
          <InitialsBadge name={profile?.name ?? '?'} size={34} radius={11} />
        </button>
```

`navigate` is already in scope — `switchSide` uses it.

- [ ] **Step 4: Strip AccountMenu from all eleven pages**

In each of the eleven files listed under **Files**, make the same four edits:

1. Delete the `import { AccountMenu } from '…/components/AccountMenu'` line.
2. Delete the `const [accountOpen, setAccountOpen] = useState(false)` line.
3. Delete the `<AccountMenu open={accountOpen} onClose={() => setAccountOpen(false)} />` line.
4. Change `<AppHeader view="…" onOpenAccount={() => setAccountOpen(true)} />` to `<AppHeader view="…" />`, keeping any `title` prop that is already there.

`tsconfig.json` sets `noUnusedLocals`, so a leftover `useState` import that nothing else uses will fail the build — Step 7 catches it.

Then delete the component:

```bash
git rm src/components/AccountMenu.tsx
```

- [ ] **Step 5: Verify nothing references the removed pieces**

Run: `grep -rn "AccountMenu\|onOpenAccount\|accountOpen" src/`
Expected: no output.

- [ ] **Step 6: Add the routes**

In `src/App.tsx`, add the imports:

```tsx
import { OwnerRoute } from './components/OwnerRoute'
import { Account } from './pages/Account'
```

Add the account route beside the existing `/account/business` line, and move `/commercial/reports` behind the guard. Replace the `<Route path="/commercial/reports" element={<Reports />} />` line with nothing, and add this block just before the `{/* Domestic */}` comment:

```tsx
            <Route path="/account" element={<Account />} />
            <Route element={<OwnerRoute />}>
              <Route path="/commercial/reports" element={<Reports />} />
            </Route>
```

`/account/business` keeps its existing position and stays open to everyone. `ModeGate` already returns `<Outlet />` early for any path starting `/account`, so the new pages work from either segment without further change.

- [ ] **Step 7: Verify the build**

Run: `npm test && npm run build`
Expected: all tests pass; vite writes `dist/` with no TypeScript errors.

- [ ] **Step 8: Commit**

```bash
git add -A src/
git commit -m "feat(account): full-page account screen replacing the bottom sheet"
```

---

## Task 9: Staff roster page

**Files:**
- Create: `src/pages/Staff.tsx`
- Modify: `src/App.tsx` — one route inside the existing `OwnerRoute` block

**Interfaces:**
- Consumes: `useStaff` (Task 7); `sortStaff`, `roleLabel`, `segmentLabel` (Task 2); `useAuth`.
- Produces: `<Staff />` at `/account/staff`.

- [ ] **Step 1: Write the page**

Create `src/pages/Staff.tsx`:

```tsx
import { Link } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { useStaff } from '../hooks/useStaff'
import { sortStaff, roleLabel, segmentLabel } from '../utils/staff'
import { ChevronLeftIcon, UserPlusIcon } from '../components/icons'
import { InitialsBadge } from '../components/InitialsBadge'
import type { Profile } from '../types/db'

const pillCls = 'rounded-full px-[9px] py-[3px] text-[10.5px] font-bold uppercase tracking-[0.4px]'

function StaffRow({ person, isYou }: { person: Profile; isYou: boolean }) {
  return (
    <Link
      to={`/account/staff/${person.id}`}
      className="flex items-center gap-3 rounded-[16px] bg-surface px-[14px] py-[13px] shadow-card"
    >
      <InitialsBadge name={person.name} size={40} radius={13} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-[14.5px] font-bold text-ink">
          {person.name}
          {isYou && <span className="ml-[6px] text-[11.5px] font-semibold text-subtle">You</span>}
        </p>
        <div className="mt-[5px] flex flex-wrap items-center gap-[6px]">
          <span className={`${pillCls} ${person.role === 'owner' ? 'bg-[#FBEDE4] text-[#E4571B]' : 'bg-[#F1E9DB] text-muted'}`}>
            {roleLabel(person.role)}
          </span>
          <span className={`${pillCls} bg-[#F1E9DB] text-muted`}>{segmentLabel(person.segment_access)}</span>
          {!person.active && <span className={`${pillCls} bg-[#FBE9E4] text-[#C23B22]`}>Off</span>}
        </div>
      </div>
      <span className="text-[#C0B4A2]">›</span>
    </Link>
  )
}

export function Staff() {
  const { profile } = useAuth()
  const { staff, loading, error } = useStaff()

  const active = sortStaff(staff.filter((p) => p.active))
  const inactive = sortStaff(staff.filter((p) => !p.active))

  return (
    <div className="p-4">
      <Link to="/account" className="mb-3 inline-flex items-center gap-[6px] py-[6px] text-sm font-bold text-muted">
        <ChevronLeftIcon size={18} /> Account
      </Link>
      <h1 className="mb-4 font-display text-[24px] font-bold tracking-[-0.5px] text-ink">Staff</h1>

      {loading && <p className="text-muted">Loading…</p>}
      {error && <p className="text-sm text-red-600">{error}</p>}

      {!loading && (
        <>
          <div className="space-y-[10px]">
            {active.map((p) => (
              <StaffRow key={p.id} person={p} isYou={p.id === profile?.id} />
            ))}
          </div>

          {inactive.length > 0 && (
            <>
              <p className="mb-2 mt-6 text-[11px] font-bold uppercase tracking-[0.5px] text-subtle">Turned off</p>
              <div className="space-y-[10px] opacity-70">
                {inactive.map((p) => (
                  <StaffRow key={p.id} person={p} isYou={p.id === profile?.id} />
                ))}
              </div>
            </>
          )}

          <Link
            to="/account/staff/new"
            className="mt-6 flex h-[52px] w-full items-center justify-center gap-2 rounded-[16px] bg-accent text-[15px] font-bold text-white"
          >
            <UserPlusIcon size={18} color="#fff" /> Add staff member
          </Link>
        </>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Add the route**

In `src/App.tsx`, add the import:

```tsx
import { Staff } from './pages/Staff'
```

and a line inside the `OwnerRoute` block from Task 8:

```tsx
            <Route element={<OwnerRoute />}>
              <Route path="/commercial/reports" element={<Reports />} />
              <Route path="/account/staff" element={<Staff />} />
            </Route>
```

- [ ] **Step 3: Verify the build**

Run: `npm run build`
Expected: no TypeScript errors.

- [ ] **Step 4: Commit**

```bash
git add src/pages/Staff.tsx src/App.tsx
git commit -m "feat(staff): roster page"
```

---

## Task 10: Staff create and edit screen

**Files:**
- Create: `src/pages/StaffEdit.tsx`
- Modify: `src/App.tsx` — two routes inside the `OwnerRoute` block

**Interfaces:**
- Consumes: `useStaff` (Task 7); `createStaff`, `setStaffActive` (Task 5); `canEditOwnAccess`, `wouldOrphanOwners`, `staffErrorMessage`, `roleLabel`, `segmentLabel`, `ROLES`, `SEGMENTS` (Task 2); `useProfiles`; `formatDate` from `src/utils/format.ts`; `supabase`.
- Produces: `<StaffEdit />` at `/account/staff/new` and `/account/staff/:id`.

One component in two modes, the way `NewSale` handles new-versus-edit.

- [ ] **Step 1: Write the page**

Create `src/pages/StaffEdit.tsx`:

```tsx
import { FormEvent, useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { useStaff } from '../hooks/useStaff'
import { useProfiles } from '../hooks/useProfiles'
import { supabase } from '../lib/supabase'
import { createStaff, setStaffActive } from '../lib/staffAdmin'
import {
  ROLES,
  SEGMENTS,
  canEditOwnAccess,
  roleLabel,
  segmentLabel,
  staffErrorMessage,
  wouldOrphanOwners,
} from '../utils/staff'
import { formatDate } from '../utils/format'
import { ChevronLeftIcon } from '../components/icons'
import type { Role, SegmentAccess } from '../types/db'

const fieldLabel = 'mb-[7px] text-[11px] font-bold uppercase tracking-[0.5px] text-muted'
const fieldInput = 'h-[50px] w-full rounded-[14px] border border-borderMuted bg-cream px-[14px] font-semibold text-ink'
const cardCls = 'space-y-4 rounded-[20px] bg-surface p-5 shadow-card'

function Choice<T extends string>({
  options,
  value,
  onChange,
  label,
  disabled,
}: {
  options: readonly T[]
  value: T
  onChange: (v: T) => void
  label: (v: T) => string
  disabled: boolean
}) {
  return (
    <div className="flex gap-2">
      {options.map((option) => (
        <button
          key={option}
          type="button"
          disabled={disabled}
          onClick={() => onChange(option)}
          className={`h-[44px] flex-1 rounded-[13px] border-[1.5px] text-[13.5px] font-bold transition disabled:opacity-50 ${
            value === option
              ? 'border-accent bg-[#FBEDE4] text-[#E4571B]'
              : 'border-borderMuted bg-cream text-muted'
          }`}
        >
          {label(option)}
        </button>
      ))}
    </div>
  )
}

export function StaffEdit() {
  const { id } = useParams()
  const isNew = id === undefined
  const navigate = useNavigate()
  const { profile } = useAuth()
  const { staff, loading, refresh } = useStaff()
  const profileNames = useProfiles()

  const person = isNew ? undefined : staff.find((p) => p.id === id)

  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [role, setRole] = useState<Role>('staff')
  const [segment, setSegment] = useState<SegmentAccess>('both')
  const [active, setActive] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!person) return
    setName(person.name)
    setRole(person.role)
    setSegment(person.segment_access)
    setActive(person.active)
  }, [person])

  // Role, segment access and the active toggle are rejected by the database on
  // your own row. Disabling them with the reason shown beats surfacing a raised
  // exception after the round trip.
  const accessEditable = isNew || canEditOwnAccess(id!, profile?.id)
  const orphans = !isNew && wouldOrphanOwners(staff, id!, { role, active })

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)

    if (!isNew && orphans) {
      setError('At least one active owner is required.')
      return
    }

    setSaving(true)

    if (isNew) {
      const result = await createStaff({ name, email, password, role, segment_access: segment })
      setSaving(false)
      if (!result.ok) {
        setError(staffErrorMessage(result.error))
        return
      }
      await refresh()
      navigate('/account/staff')
      return
    }

    // Name, role and segment access go straight through RLS -- the owner
    // update policy covers them. Only the active flag needs the service-role
    // key, because it also bans the auth user.
    const fieldsChanged =
      name !== person?.name || role !== person?.role || segment !== person?.segment_access
    if (fieldsChanged) {
      const { error: updateError } = await supabase
        .from('profiles')
        .update({ name: name.trim(), role, segment_access: segment })
        .eq('id', id!)
      if (updateError) {
        setSaving(false)
        setError(updateError.message)
        return
      }
    }

    if (active !== person?.active) {
      const result = await setStaffActive(id!, active)
      if (!result.ok) {
        setSaving(false)
        setError(staffErrorMessage(result.error))
        return
      }
    }

    setSaving(false)
    await refresh()
    navigate('/account/staff')
  }

  if (!isNew && loading) return <p className="p-4 text-muted">Loading…</p>
  if (!isNew && !person) return <p className="p-4 text-muted">That person is no longer on the roster.</p>

  const changedBy = person?.updated_by ? profileNames.get(person.updated_by) : undefined

  return (
    <div className="p-4">
      <Link to="/account/staff" className="mb-3 inline-flex items-center gap-[6px] py-[6px] text-sm font-bold text-muted">
        <ChevronLeftIcon size={18} /> Staff
      </Link>
      <h1 className="mb-4 font-display text-[24px] font-bold tracking-[-0.5px] text-ink">
        {isNew ? 'Add staff member' : person!.name}
      </h1>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className={cardCls}>
          <div>
            <p className={fieldLabel}>Name</p>
            <input value={name} onChange={(e) => setName(e.target.value)} className={fieldInput} />
          </div>
          {isNew && (
            <>
              <div>
                <p className={fieldLabel}>Email</p>
                <input
                  type="email"
                  autoCapitalize="none"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className={fieldInput}
                />
              </div>
              <div>
                <p className={fieldLabel}>Password</p>
                <input
                  type="text"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className={fieldInput}
                />
                <p className="mt-[6px] text-[11.5px] font-semibold text-subtle">
                  At least 8 characters. Hand it over in person — it cannot be changed from the app yet.
                </p>
              </div>
            </>
          )}
        </div>

        <div>
          <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.5px] text-subtle">Access</p>
          <div className={cardCls}>
            <div>
              <p className={fieldLabel}>Role</p>
              <Choice options={ROLES} value={role} onChange={setRole} label={roleLabel} disabled={!accessEditable} />
            </div>
            <div>
              <p className={fieldLabel}>Can use</p>
              <Choice
                options={SEGMENTS}
                value={segment}
                onChange={setSegment}
                label={segmentLabel}
                disabled={!accessEditable}
              />
            </div>
            {!isNew && (
              <label className="flex items-center justify-between py-1">
                <span className="text-[14px] font-bold text-ink">Can sign in</span>
                <input
                  type="checkbox"
                  checked={active}
                  disabled={!accessEditable}
                  onChange={(e) => setActive(e.target.checked)}
                  className="h-[22px] w-[22px] accent-accent disabled:opacity-50"
                />
              </label>
            )}
            {!accessEditable && (
              <p className="text-[11.5px] font-semibold text-subtle">
                You cannot change your own role or turn off your own access. Ask the other owner.
              </p>
            )}
            {orphans && (
              <p className="text-[11.5px] font-semibold text-[#C23B22]">
                At least one active owner is required.
              </p>
            )}
          </div>
        </div>

        {!isNew && person!.updated_at && (
          <p className="text-[11.5px] font-semibold text-subtle">
            Last changed {formatDate(person!.updated_at)}
            {changedBy ? ` by ${changedBy}` : ''}
          </p>
        )}

        {error && <p className="text-sm text-red-600">{error}</p>}

        <button
          type="submit"
          disabled={saving || orphans}
          className="w-full rounded-lg bg-accent py-3 font-semibold text-white disabled:opacity-50"
        >
          {saving ? 'Saving…' : isNew ? 'Create login' : 'Save'}
        </button>
      </form>
    </div>
  )
}
```

- [ ] **Step 2: Add the routes**

In `src/App.tsx`, add the import:

```tsx
import { StaffEdit } from './pages/StaffEdit'
```

and two lines inside the `OwnerRoute` block. `/new` must come before `/:id`, or the router matches `new` as an id:

```tsx
            <Route element={<OwnerRoute />}>
              <Route path="/commercial/reports" element={<Reports />} />
              <Route path="/account/staff" element={<Staff />} />
              <Route path="/account/staff/new" element={<StaffEdit />} />
              <Route path="/account/staff/:id" element={<StaffEdit />} />
            </Route>
```

- [ ] **Step 3: Verify the build**

Run: `npm test && npm run build`
Expected: all tests pass; no TypeScript errors.

- [ ] **Step 4: Commit**

```bash
git add src/pages/StaffEdit.tsx src/App.tsx
git commit -m "feat(staff): create and edit screen"
```

---

## Task 11: End-to-end pass on a real session

**Files:** none — verification only.

Everything above is unit-tested or hand-verified in SQL. This task exercises the three layers together, which nothing else does.

- [ ] **Step 1: Start the dev server**

```bash
npm run dev
```

- [ ] **Step 2: Walk the owner path**

Signed in as the owner:

1. Tap the avatar in the header. Expected: `/account`, full page, with Reports, Staff, Business details and Sign out.
2. Tap Staff. Expected: the roster, your own row marked "You".
3. Tap your own row. Expected: role, "Can use" and "Can sign in" all disabled, with the explanation beneath them.
4. Back, then "Add staff member". Enter a name, an email, a 7-character password. Submit. Expected: "Password must be at least 8 characters", no user created.
5. Fix the password to 8+ characters, pick role Staff and "Domestic". Submit. Expected: back on the roster, the new person listed with a Staff pill and a Domestic pill.
6. Add a second person with the same email. Expected: "That email already has a login."

- [ ] **Step 3: Walk the staff path**

In a private window, sign in as the new staff member:

1. Expected: lands on `/domestic` and cannot switch sides — the swap button is absent, because `segment_access` is not `both`.
2. Tap the avatar. Expected: `/account` with Business details and Sign out only — no Reports, no Staff.
3. Navigate to `/account/staff` by typing the URL. Expected: redirected to `/account`.
4. Navigate to `/commercial/reports` by typing the URL. Expected: redirected to `/account`.

- [ ] **Step 4: Deactivate and confirm the lockout**

Back in the owner window:

1. Open the new person's row, untick "Can sign in", save. Expected: they move to the "Turned off" group with an "Off" pill.
2. In the staff window, reload. Expected: bounced to the login screen showing "Your access has been turned off. Ask the owner to turn it back on."
3. Try to sign in as them again. Expected: the same message, sign-in refused.
4. Owner re-ticks "Can sign in". Expected: they can sign in again.

- [ ] **Step 5: Confirm the last-owner rule end to end**

As the only owner, open your own row. Expected: the role control is already disabled — the rule is unreachable from the UI for a single owner, which is the intent. The database backstop was proved in Task 1, Step 4, check 4.

- [ ] **Step 6: Final suite and build**

Run: `npm test && npm run build`
Expected: all test files pass; vite writes `dist/`.

- [ ] **Step 7: Commit anything outstanding and push**

```bash
git status
git push -u origin feat/staff-management
```
