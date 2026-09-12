# WhatsApp Bill Notifications Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When a commercial bill is saved, automatically send the customer a WhatsApp message summarising it, via the Meta Cloud API.

**Architecture:** The browser saves the bill as it does today, then fires a non-blocking call to a new Supabase Edge Function with only the `bill_id`. The function verifies the caller's JWT, re-reads the bill, lines, and customer server-side, evaluates guards, calls Meta's Graph API, and records the outcome in a new `whatsapp_sends` table. The client never sees the API token and never supplies message content.

**Tech Stack:** React 18 + TypeScript + Vite, Supabase (Postgres + Edge Functions on Deno), vitest (node environment), Tailwind.

**Spec:** `docs/superpowers/specs/2026-09-13-whatsapp-bill-send-design.md`

## Global Constraints

- Graph API version: `v25.0`. Endpoint: `https://graph.facebook.com/v25.0/{PHONE_NUMBER_ID}/messages`.
- Secrets live only in Supabase secrets: `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_TOKEN`. Never in the client bundle, never in git, never logged.
- Template category is **Utility**. No promotional wording in any template body.
- WhatsApp template parameters must not contain newlines or tabs. Meta rejects the message outright.
- Amounts are integer rupees: no decimals, no thousands separators.
- Dates are `DD-MM-YYYY` in IST.
- `whatsapp_enabled` defaults to `false`. Nothing sends until a customer is explicitly enabled.
- Only commercial paths are wired. Domestic bills carry `customer_id: null` and are out of scope.
- Existing test style: vitest, `environment: 'node'`, pure-function tests, `vi.mock('../lib/supabase', () => ({ supabase: {} }))` when a module imports the client.
- Run tests with `npm test`. Type-check with `npx tsc -b`.

## File Structure

| File | Responsibility |
|---|---|
| `supabase/migrations/011_whatsapp_sends.sql` | `whatsapp_enabled` column, `whatsapp_sends` table, RLS |
| `src/utils/phone.ts` | Phone normalization to E.164 digits (shared by client and function) |
| `src/utils/whatsappTemplates.ts` | Pure template-parameter builders, one per bill type |
| `supabase/functions/send-bill-whatsapp/index.ts` | Edge Function: auth, guards, Meta call, result row |
| `supabase/functions/send-bill-whatsapp/phone.ts` | Deno copy of the normalizer (Edge Functions cannot import from `src/`) |
| `supabase/functions/send-bill-whatsapp/templates.ts` | Deno copy of the param builders |
| `src/lib/whatsapp.ts` | Client helper: invokes the function, never throws |
| `src/hooks/useWhatsAppSends.ts` | Reads latest send row per bill |
| `src/components/WhatsAppStatus.tsx` | Status chip + Retry / Turn on / Add phone actions |
| `src/types/db.ts` | `WhatsAppSend` type, `whatsapp_enabled` on `Customer` |

**On the duplicated Deno files:** Supabase Edge Functions run on Deno with their own module graph and cannot import from the Vite `src/` tree. The normalizer and param builders are therefore duplicated. Task 3 and Task 5 keep them byte-identical in logic, and Task 5's tests run against the Deno copies specifically so drift is caught. This duplication is deliberate — do not try to share via a symlink or a build step.

---

### Task 1: Database migration

**Files:**
- Create: `supabase/migrations/011_whatsapp_sends.sql`
- Modify: `src/types/db.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: table `whatsapp_sends`, column `customers.whatsapp_enabled`, TS types `WhatsAppSend`, `WhatsAppSendStatus`, `WhatsAppSkipReason`.

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/011_whatsapp_sends.sql`:

```sql
-- WhatsApp bill notifications.
-- whatsapp_enabled defaults to false: nothing is sent until a customer is
-- explicitly opted in, so deploying this migration cannot message anyone.
alter table customers
  add column whatsapp_enabled boolean not null default false;

-- One row per send ATTEMPT, not per bill. A retry appends a row so the
-- history of what failed and why is preserved.
create table whatsapp_sends (
  id         bigint generated always as identity primary key,
  bill_id    bigint not null references bills(id) on delete cascade,
  status     text   not null check (status in ('sent','failed','skipped')),
  reason     text,
  message_id text,
  template   text   not null,
  created_at timestamptz not null default now()
);

create index whatsapp_sends_bill_id_idx on whatsapp_sends (bill_id);

alter table whatsapp_sends enable row level security;

-- Read-only for the app. There is deliberately NO insert policy for
-- authenticated: rows are written solely by the Edge Function using the
-- service role key, which bypasses RLS. A client able to insert here could
-- fake a 'sent' status for a bill that was never delivered.
create policy "read whatsapp_sends" on whatsapp_sends
  for select to authenticated using (true);
```

- [ ] **Step 2: Apply the migration**

Run: `supabase db push`

Expected: migration applies cleanly. If the project uses a different apply command, check `README.md` and follow the existing convention for migrations `002`–`010`.

- [ ] **Step 3: Verify the schema landed**

Run this in the Supabase SQL editor:

```sql
select column_name, data_type, column_default
from information_schema.columns
where table_name = 'whatsapp_sends'
order by ordinal_position;
```

Expected: 7 rows — `id`, `bill_id`, `status`, `reason`, `message_id`, `template`, `created_at`.

Then confirm the default is false:

```sql
select column_default from information_schema.columns
where table_name = 'customers' and column_name = 'whatsapp_enabled';
```

Expected: `false`.

- [ ] **Step 4: Add the TypeScript types**

In `src/types/db.ts`, add `whatsapp_enabled` to the existing `Customer` interface:

```ts
export interface Customer {
  id: number
  name: string
  phone: string | null
  address: string | null
  whatsapp_enabled: boolean
  created_at: string
}
```

Then append these new types at the end of the file:

```ts
export type WhatsAppSendStatus = 'sent' | 'failed' | 'skipped'

export type WhatsAppSkipReason =
  | 'no_customer'
  | 'no_phone'
  | 'invalid_phone'
  | 'disabled'
  | 'not_applicable'

export interface WhatsAppSend {
  id: number
  bill_id: number
  status: WhatsAppSendStatus
  reason: string | null
  message_id: string | null
  template: string
  created_at: string
}
```

- [ ] **Step 5: Type-check**

Run: `npx tsc -b`

Expected: passes. If `Customer` is constructed literally anywhere without `whatsapp_enabled`, the compiler will point at it — add the field there rather than making it optional.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/011_whatsapp_sends.sql src/types/db.ts
git commit -m "feat(whatsapp): add whatsapp_sends table and opt-in column"
```

---

### Task 2: Phone normalization

**Files:**
- Create: `src/utils/phone.ts`
- Test: `src/utils/phone.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `normalizeIndianPhone(raw: string | null | undefined): string | null` — returns E.164 digits with no `+` (e.g. `919876543210`), or `null` when the input cannot be normalized.

- [ ] **Step 1: Write the failing test**

Create `src/utils/phone.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { normalizeIndianPhone } from './phone'

describe('normalizeIndianPhone', () => {
  it('prefixes a bare 10-digit mobile with the country code', () => {
    expect(normalizeIndianPhone('9876543210')).toBe('919876543210')
  })

  it('accepts a +91 prefixed number', () => {
    expect(normalizeIndianPhone('+919876543210')).toBe('919876543210')
  })

  it('strips spaces, hyphens and parentheses', () => {
    expect(normalizeIndianPhone('+91 98765-43210')).toBe('919876543210')
    expect(normalizeIndianPhone('(098765) 43210')).toBe('919876543210')
  })

  it('accepts a 12-digit number already starting with 91', () => {
    expect(normalizeIndianPhone('919876543210')).toBe('919876543210')
  })

  it('strips a leading 0 before a 10-digit mobile', () => {
    expect(normalizeIndianPhone('09876543210')).toBe('919876543210')
  })

  it('rejects a landline that is too short', () => {
    expect(normalizeIndianPhone('08662345')).toBeNull()
  })

  it('rejects null, undefined and empty input', () => {
    expect(normalizeIndianPhone(null)).toBeNull()
    expect(normalizeIndianPhone(undefined)).toBeNull()
    expect(normalizeIndianPhone('')).toBeNull()
    expect(normalizeIndianPhone('   ')).toBeNull()
  })

  it('rejects junk and overlong input', () => {
    expect(normalizeIndianPhone('not a phone')).toBeNull()
    expect(normalizeIndianPhone('9198765432109999')).toBeNull()
  })

  it('rejects a 10-digit number that cannot be an Indian mobile', () => {
    // Indian mobile numbers start with 6-9.
    expect(normalizeIndianPhone('1234567890')).toBeNull()
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/utils/phone.test.ts`

Expected: FAIL — cannot resolve `./phone`.

- [ ] **Step 3: Write the implementation**

Create `src/utils/phone.ts`:

```ts
/**
 * Normalize a stored customer phone number to the digits-only E.164 form
 * the WhatsApp Cloud API expects (country code, no '+', no separators).
 *
 * The stored value in `customers.phone` is free text and is never rewritten —
 * normalization happens only at send time.
 *
 * Returns null when the input cannot be a valid Indian mobile number, which
 * the caller records as `invalid_phone`.
 */
export function normalizeIndianPhone(raw: string | null | undefined): string | null {
  if (!raw) return null

  const digits = raw.replace(/\D/g, '')
  if (digits.length === 0) return null

  // 0XXXXXXXXXX — trunk prefix used when dialling domestically.
  const withoutTrunk = digits.length === 11 && digits.startsWith('0') ? digits.slice(1) : digits

  if (withoutTrunk.length === 10) {
    return isIndianMobile(withoutTrunk) ? `91${withoutTrunk}` : null
  }

  if (withoutTrunk.length === 12 && withoutTrunk.startsWith('91')) {
    const local = withoutTrunk.slice(2)
    return isIndianMobile(local) ? withoutTrunk : null
  }

  return null
}

/** Indian mobile numbers are 10 digits beginning 6, 7, 8 or 9. */
function isIndianMobile(local: string): boolean {
  return /^[6-9]\d{9}$/.test(local)
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/utils/phone.test.ts`

Expected: PASS, 9 tests.

- [ ] **Step 5: Commit**

```bash
git add src/utils/phone.ts src/utils/phone.test.ts
git commit -m "feat(whatsapp): add Indian phone normalization"
```

---

### Task 3: Template parameter builders

**Files:**
- Create: `src/utils/whatsappTemplates.ts`
- Test: `src/utils/whatsappTemplates.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `type TemplateName = 'bill_sale' | 'bill_payment' | 'bill_return'`
  - `interface BillContext { customerName: string; billNumber: string; createdAt: string; totalAmount: number; method: string | null; lines: { productName: string; qty: number }[]; balanceDue: number; emptiesOutstanding: number }`
  - `templateForBillType(type: string): TemplateName | null`
  - `buildTemplateParams(template: TemplateName, ctx: BillContext): string[]`
  - `formatBillDate(iso: string): string`
  - `formatItems(lines: { productName: string; qty: number }[]): string`

- [ ] **Step 1: Write the failing test**

Create `src/utils/whatsappTemplates.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import {
  templateForBillType,
  buildTemplateParams,
  formatBillDate,
  formatItems,
  type BillContext,
} from './whatsappTemplates'

const base: BillContext = {
  customerName: 'Ramesh Traders',
  billNumber: 'S-1042',
  createdAt: '2026-09-13T06:30:00.000Z',
  totalAmount: 4300,
  method: 'cash',
  lines: [{ productName: '19kg Commercial', qty: 2 }],
  balanceDue: 12500,
  emptiesOutstanding: 7,
}

describe('templateForBillType', () => {
  it('maps the three sending bill types', () => {
    expect(templateForBillType('sale')).toBe('bill_sale')
    expect(templateForBillType('payment')).toBe('bill_payment')
    expect(templateForBillType('return')).toBe('bill_return')
  })

  it('returns null for opening bills, which must never send', () => {
    expect(templateForBillType('opening')).toBeNull()
  })

  it('returns null for an unknown type', () => {
    expect(templateForBillType('something_else')).toBeNull()
  })
})

describe('formatBillDate', () => {
  it('formats as DD-MM-YYYY in IST', () => {
    expect(formatBillDate('2026-09-13T06:30:00.000Z')).toBe('13-09-2026')
  })

  it('rolls to the next IST day for a late-evening UTC timestamp', () => {
    // 19:00 UTC on the 13th is 00:30 IST on the 14th.
    expect(formatBillDate('2026-09-13T19:00:00.000Z')).toBe('14-09-2026')
  })
})

describe('formatItems', () => {
  it('joins items on one line', () => {
    expect(formatItems([
      { productName: '19kg Commercial', qty: 2 },
      { productName: '5kg', qty: 1 },
    ])).toBe('2 × 19kg Commercial, 1 × 5kg')
  })

  it('never emits a newline or tab, whatever the product names contain', () => {
    const out = formatItems([{ productName: '19kg\nCommercial\tA', qty: 2 }])
    expect(out).not.toMatch(/[\n\t]/)
    expect(out).toBe('2 × 19kg Commercial A')
  })

  it('returns a dash for an empty line list', () => {
    expect(formatItems([])).toBe('-')
  })
})

describe('buildTemplateParams', () => {
  it('builds sale params in template order', () => {
    expect(buildTemplateParams('bill_sale', base)).toEqual([
      'Ramesh Traders', 'S-1042', '13-09-2026', '2 × 19kg Commercial', '4300', '12500',
    ])
  })

  it('builds payment params with a title-cased method', () => {
    expect(buildTemplateParams('bill_payment', { ...base, method: 'upi' })).toEqual([
      'Ramesh Traders', '4300', '13-09-2026', 'Upi', '12500',
    ])
  })

  it('falls back to Cash when a payment has no method recorded', () => {
    expect(buildTemplateParams('bill_payment', { ...base, method: null })[3]).toBe('Cash')
  })

  it('builds return params from line quantities', () => {
    expect(buildTemplateParams('bill_return', {
      ...base,
      lines: [{ productName: '19kg Commercial', qty: 3 }],
    })).toEqual([
      'Ramesh Traders', '13-09-2026', '3 × 19kg Commercial', '7',
    ])
  })

  it('rounds amounts to whole rupees with no separators', () => {
    const out = buildTemplateParams('bill_sale', { ...base, totalAmount: 4300.6, balanceDue: 125000 })
    expect(out[4]).toBe('4301')
    expect(out[5]).toBe('125000')
  })

  it('renders a negative balance (customer in credit) without breaking', () => {
    expect(buildTemplateParams('bill_sale', { ...base, balanceDue: -500 })[5]).toBe('-500')
  })

  it('never emits a parameter containing a newline', () => {
    for (const t of ['bill_sale', 'bill_payment', 'bill_return'] as const) {
      for (const p of buildTemplateParams(t, { ...base, customerName: 'Bad\nName' })) {
        expect(p).not.toMatch(/[\n\t]/)
      }
    }
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/utils/whatsappTemplates.test.ts`

Expected: FAIL — cannot resolve `./whatsappTemplates`.

- [ ] **Step 3: Write the implementation**

Create `src/utils/whatsappTemplates.ts`:

```ts
export type TemplateName = 'bill_sale' | 'bill_payment' | 'bill_return'

export interface BillContext {
  customerName: string
  billNumber: string
  /** ISO timestamp from bills.created_at */
  createdAt: string
  totalAmount: number
  /** bills.method; null on bills where no method was recorded */
  method: string | null
  /**
   * For sales, qty is cylinders sold. For returns, qty is cylinders returned —
   * LogReturn writes the returned count into bill_lines.qty and leaves
   * empties at 0, matching how customer_product_balances computes `returned`.
   */
  lines: { productName: string; qty: number }[]
  balanceDue: number
  emptiesOutstanding: number
}

export function templateForBillType(type: string): TemplateName | null {
  switch (type) {
    case 'sale':
      return 'bill_sale'
    case 'payment':
      return 'bill_payment'
    case 'return':
      return 'bill_return'
    default:
      // 'opening' and anything unrecognised must never send.
      return null
  }
}

/** DD-MM-YYYY in IST, regardless of where the function runs. */
export function formatBillDate(iso: string): string {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Kolkata',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).formatToParts(new Date(iso))
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? ''
  return `${get('day')}-${get('month')}-${get('year')}`
}

/**
 * One line, comma separated. WhatsApp rejects template parameters containing
 * newlines or tabs, so any whitespace inside product names is collapsed.
 */
export function formatItems(lines: { productName: string; qty: number }[]): string {
  if (lines.length === 0) return '-'
  return lines.map((l) => `${l.qty} × ${clean(l.productName)}`).join(', ')
}

function clean(value: string): string {
  return value.replace(/\s+/g, ' ').trim()
}

function rupees(amount: number): string {
  return String(Math.round(amount))
}

function titleCase(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1).toLowerCase()
}

export function buildTemplateParams(template: TemplateName, ctx: BillContext): string[] {
  const name = clean(ctx.customerName)
  const date = formatBillDate(ctx.createdAt)

  switch (template) {
    case 'bill_sale':
      return [
        name,
        clean(ctx.billNumber),
        date,
        formatItems(ctx.lines),
        rupees(ctx.totalAmount),
        rupees(ctx.balanceDue),
      ]
    case 'bill_payment':
      return [
        name,
        rupees(ctx.totalAmount),
        date,
        titleCase(ctx.method ?? 'cash'),
        rupees(ctx.balanceDue),
      ]
    case 'bill_return':
      return [
        name,
        date,
        formatItems(ctx.lines),
        String(Math.round(ctx.emptiesOutstanding)),
      ]
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/utils/whatsappTemplates.test.ts`

Expected: PASS, 14 tests.

- [ ] **Step 5: Run the whole suite**

Run: `npm test`

Expected: all tests pass, including the pre-existing `useActivityFeed` tests.

- [ ] **Step 6: Commit**

```bash
git add src/utils/whatsappTemplates.ts src/utils/whatsappTemplates.test.ts
git commit -m "feat(whatsapp): add template parameter builders"
```

---

### Task 4: Submit the templates to Meta

This task has no code. It is separated because template approval is asynchronous and gates production sending — start it early so it runs in the background while Tasks 5–8 proceed. Development against the test number does not depend on it.

**Files:** none.

**Interfaces:**
- Consumes: nothing.
- Produces: three approved Utility templates named `bill_sale`, `bill_payment`, `bill_return` in `en` — the names Task 5 sends.

- [ ] **Step 1: Open WhatsApp Manager**

Go to https://business.facebook.com/ → WhatsApp Manager → Message Templates → Create template.

- [ ] **Step 2: Create `bill_sale`**

- Category: **Utility** (not Marketing — Marketing is roughly 7.5× the cost)
- Name: `bill_sale`
- Language: English
- Body:

```
Namaste {{1}}, bill {{2}} dated {{3}}.
Items: {{4}}
Amount: Rs {{5}}
Balance due: Rs {{6}}
```

- Sample values when prompted: `Ramesh Traders`, `S-1042`, `13-09-2026`, `2 × 19kg Commercial`, `4300`, `12500`

- [ ] **Step 3: Create `bill_payment`**

- Category: **Utility**, Name: `bill_payment`, Language: English
- Body:

```
Namaste {{1}}, payment of Rs {{2}} received on {{3}} via {{4}}.
Balance due: Rs {{5}}
```

- Samples: `Ramesh Traders`, `4300`, `13-09-2026`, `Cash`, `12500`

- [ ] **Step 4: Create `bill_return`**

- Category: **Utility**, Name: `bill_return`, Language: English
- Body:

```
Namaste {{1}}, return recorded on {{2}}.
Returned: {{3}}
Empties outstanding: {{4}}
```

- Samples: `Ramesh Traders`, `13-09-2026`, `3 × 19kg Commercial`, `7`

- [ ] **Step 5: Confirm all three show Approved**

Check the Message Templates list. Approval is typically minutes to hours.

If any is rejected, the reason is almost always promotional wording or a mismatched sample. Fix the flagged element and resubmit — do not change the placeholder count or order, because Task 5 sends parameters positionally.

---

### Task 5: Edge Function

**Files:**
- Create: `supabase/functions/send-bill-whatsapp/index.ts`
- Create: `supabase/functions/send-bill-whatsapp/phone.ts`
- Create: `supabase/functions/send-bill-whatsapp/templates.ts`
- Create: `supabase/functions/send-bill-whatsapp/templates.test.ts`

**Interfaces:**
- Consumes: `whatsapp_sends` table and `customers.whatsapp_enabled` from Task 1. Logic mirrors `src/utils/phone.ts` (Task 2) and `src/utils/whatsappTemplates.ts` (Task 3).
- Produces: HTTP endpoint accepting `POST { bill_id: number }`, returning `{ status, reason, message_id }` with HTTP 200 for every handled outcome (including skips and Meta failures), 401 for an unauthenticated caller, 400 for a malformed body.

- [ ] **Step 1: Copy the shared logic into the function directory**

Edge Functions run on Deno with a separate module graph and cannot import from the Vite `src/` tree. Copy both modules verbatim:

```bash
mkdir -p supabase/functions/send-bill-whatsapp
cp src/utils/phone.ts supabase/functions/send-bill-whatsapp/phone.ts
cp src/utils/whatsappTemplates.ts supabase/functions/send-bill-whatsapp/templates.ts
```

Do not edit the copies. They must stay logically identical to their `src/` originals.

- [ ] **Step 2: Write the failing test for the Deno copies**

Create `supabase/functions/send-bill-whatsapp/templates.test.ts`. This exists so the copies cannot silently drift from the originals:

```ts
import { describe, it, expect } from 'vitest'
import { buildTemplateParams, templateForBillType, type BillContext } from './templates'
import { normalizeIndianPhone } from './phone'

const ctx: BillContext = {
  customerName: 'Ramesh Traders',
  billNumber: 'S-1042',
  createdAt: '2026-09-13T06:30:00.000Z',
  totalAmount: 4300,
  method: 'cash',
  lines: [{ productName: '19kg Commercial', qty: 2 }],
  balanceDue: 12500,
  emptiesOutstanding: 7,
}

describe('edge function copies match the src originals', () => {
  it('builds identical sale params', () => {
    expect(buildTemplateParams('bill_sale', ctx)).toEqual([
      'Ramesh Traders', 'S-1042', '13-09-2026', '2 × 19kg Commercial', '4300', '12500',
    ])
  })

  it('maps bill types identically', () => {
    expect(templateForBillType('sale')).toBe('bill_sale')
    expect(templateForBillType('opening')).toBeNull()
  })

  it('normalizes phones identically', () => {
    expect(normalizeIndianPhone('+91 98765-43210')).toBe('919876543210')
    expect(normalizeIndianPhone('1234567890')).toBeNull()
  })
})
```

- [ ] **Step 3: Run it to verify it passes**

Run: `npx vitest run supabase/functions/send-bill-whatsapp/templates.test.ts`

Expected: PASS, 3 tests. (These pass immediately — they are a drift guard, not TDD. If they fail, the copy in Step 1 went wrong.)

- [ ] **Step 4: Write the function**

Create `supabase/functions/send-bill-whatsapp/index.ts`:

```ts
import { createClient } from 'jsr:@supabase/supabase-js@2'
import { normalizeIndianPhone } from './phone.ts'
import { buildTemplateParams, templateForBillType, type BillContext } from './templates.ts'

const GRAPH_VERSION = 'v25.0'
const META_TIMEOUT_MS = 15_000

interface Outcome {
  status: 'sent' | 'failed' | 'skipped'
  reason: string | null
  message_id: string | null
  template: string
}

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') {
    return json({ error: 'method_not_allowed' }, 405)
  }

  // The caller must be a signed-in app user. Without this check anyone who
  // discovers the URL could trigger sends on the business's number.
  const authHeader = req.headers.get('Authorization') ?? ''
  const anon = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authHeader } } },
  )
  const { data: userData, error: userError } = await anon.auth.getUser()
  if (userError || !userData?.user) {
    return json({ error: 'unauthorized' }, 401)
  }

  let billId: number
  try {
    const body = await req.json()
    billId = Number(body?.bill_id)
    if (!Number.isFinite(billId) || billId <= 0) throw new Error('bad id')
  } catch {
    return json({ error: 'bad_request' }, 400)
  }

  // Service role: needed to insert into whatsapp_sends, which has no
  // authenticated insert policy by design.
  const db = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  const { data: bill, error: billError } = await db
    .from('bills')
    .select('id, bill_number, type, total_amount, method, created_at, customer_id')
    .eq('id', billId)
    .single()

  if (billError || !bill) {
    return json({ error: 'bill_not_found' }, 404)
  }

  const outcome = await resolve(db, bill)
  await db.from('whatsapp_sends').insert({
    bill_id: billId,
    status: outcome.status,
    reason: outcome.reason,
    message_id: outcome.message_id,
    template: outcome.template,
  })

  return json(outcome, 200)
})

async function resolve(db: any, bill: any): Promise<Outcome> {
  const template = templateForBillType(bill.type)
  if (!template) {
    return skip('not_applicable', bill.type)
  }
  if (!bill.customer_id) {
    return skip('no_customer', template)
  }

  const { data: customer } = await db
    .from('customers')
    .select('id, name, phone, whatsapp_enabled')
    .eq('id', bill.customer_id)
    .single()

  if (!customer) return skip('no_customer', template)
  if (!customer.whatsapp_enabled) return skip('disabled', template)
  if (!customer.phone) return skip('no_phone', template)

  const to = normalizeIndianPhone(customer.phone)
  if (!to) return skip('invalid_phone', template)

  const { data: lines } = await db
    .from('bill_lines')
    .select('qty, products(name)')
    .eq('bill_id', bill.id)

  const { data: balance } = await db
    .from('customer_balances')
    .select('amount_due')
    .eq('id', customer.id)
    .single()

  const { data: productBalances } = await db
    .from('customer_product_balances')
    .select('empties_outstanding')
    .eq('customer_id', customer.id)

  const emptiesOutstanding = (productBalances ?? [])
    .reduce((sum: number, r: any) => sum + Number(r.empties_outstanding ?? 0), 0)

  const ctx: BillContext = {
    customerName: customer.name,
    billNumber: bill.bill_number,
    createdAt: bill.created_at,
    totalAmount: Number(bill.total_amount ?? 0),
    method: bill.method,
    lines: (lines ?? []).map((l: any) => ({
      productName: l.products?.name ?? 'Item',
      qty: Number(l.qty ?? 0),
    })),
    balanceDue: Number(balance?.amount_due ?? 0),
    emptiesOutstanding,
  }

  return await send(to, template, buildTemplateParams(template, ctx))
}

async function send(to: string, template: string, params: string[]): Promise<Outcome> {
  const phoneNumberId = Deno.env.get('WHATSAPP_PHONE_NUMBER_ID')
  const token = Deno.env.get('WHATSAPP_TOKEN')
  if (!phoneNumberId || !token) {
    return { status: 'failed', reason: 'missing_credentials', message_id: null, template }
  }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), META_TIMEOUT_MS)

  try {
    const res = await fetch(
      `https://graph.facebook.com/${GRAPH_VERSION}/${phoneNumberId}/messages`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          to,
          type: 'template',
          template: {
            name: template,
            language: { code: 'en' },
            components: [{
              type: 'body',
              parameters: params.map((text) => ({ type: 'text', text })),
            }],
          },
        }),
        signal: controller.signal,
      },
    )

    const payload = await res.json().catch(() => ({}))

    if (!res.ok) {
      // Meta's error text only. Never log the request headers — they carry the token.
      const reason = payload?.error?.message ?? `http_${res.status}`
      return { status: 'failed', reason: String(reason).slice(0, 500), message_id: null, template }
    }

    return {
      status: 'sent',
      reason: null,
      message_id: payload?.messages?.[0]?.id ?? null,
      template,
    }
  } catch (err) {
    const reason = err instanceof Error && err.name === 'AbortError' ? 'timeout' : 'network_error'
    return { status: 'failed', reason, message_id: null, template }
  } finally {
    clearTimeout(timer)
  }
}

function skip(reason: string, template: string): Outcome {
  return { status: 'skipped', reason, message_id: null, template }
}

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}
```

- [ ] **Step 5: Set the secrets**

```bash
supabase secrets set WHATSAPP_PHONE_NUMBER_ID=1320784381118301
```

Then set the token. Paste it at the prompt rather than putting it in shell history:

```bash
read -rs WA_TOKEN && supabase secrets set WHATSAPP_TOKEN="$WA_TOKEN" && unset WA_TOKEN
```

`SUPABASE_URL`, `SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY` are injected automatically — do not set them.

- [ ] **Step 6: Deploy**

Run: `supabase functions deploy send-bill-whatsapp`

Expected: deploys without error, prints the function URL.

- [ ] **Step 7: Verify guards with a real bill**

Pick an existing commercial bill id whose customer is still `whatsapp_enabled = false`. Invoke the function from the app's browser console while signed in:

```js
const { data } = await supabase.functions.invoke('send-bill-whatsapp', { body: { bill_id: 123 } })
console.log(data)
```

Expected: `{ status: 'skipped', reason: 'disabled', ... }`, and a matching row appears:

```sql
select * from whatsapp_sends order by id desc limit 1;
```

- [ ] **Step 8: Verify a real send**

Enable one customer whose phone is whitelisted on the Meta test number:

```sql
update customers set whatsapp_enabled = true where id = <your own customer id>;
```

Invoke again with a `sale` bill for that customer.

Expected: `{ status: 'sent', message_id: 'wamid...' }` and the message arrives on the phone.

If it returns `failed` with a template error, Task 4 is not approved yet — that is expected and blocks only this step.

- [ ] **Step 9: Commit**

```bash
git add supabase/functions/send-bill-whatsapp
git commit -m "feat(whatsapp): add send-bill-whatsapp edge function"
```

---

### Task 6: Client send helper

**Files:**
- Create: `src/lib/whatsapp.ts`
- Test: `src/lib/whatsapp.test.ts`

**Interfaces:**
- Consumes: the deployed `send-bill-whatsapp` function from Task 5.
- Produces: `sendBillWhatsApp(billId: number): void` — fire-and-forget, never throws, never returns a promise the caller must await.

- [ ] **Step 1: Write the failing test**

Create `src/lib/whatsapp.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

const invoke = vi.fn()
vi.mock('./supabase', () => ({ supabase: { functions: { invoke } } }))

import { sendBillWhatsApp } from './whatsapp'

describe('sendBillWhatsApp', () => {
  beforeEach(() => {
    invoke.mockReset()
    invoke.mockResolvedValue({ data: { status: 'sent' }, error: null })
  })

  it('invokes the edge function with only the bill id', async () => {
    sendBillWhatsApp(42)
    await Promise.resolve()
    expect(invoke).toHaveBeenCalledWith('send-bill-whatsapp', { body: { bill_id: 42 } })
  })

  it('returns undefined synchronously so callers cannot block on it', () => {
    expect(sendBillWhatsApp(42)).toBeUndefined()
  })

  it('swallows a rejected invoke instead of throwing', async () => {
    invoke.mockRejectedValue(new Error('network down'))
    expect(() => sendBillWhatsApp(42)).not.toThrow()
    await Promise.resolve()
    await Promise.resolve()
  })

  it('does not invoke for a non-positive bill id', () => {
    sendBillWhatsApp(0)
    expect(invoke).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/lib/whatsapp.test.ts`

Expected: FAIL — cannot resolve `./whatsapp`.

- [ ] **Step 3: Write the implementation**

Create `src/lib/whatsapp.ts`:

```ts
import { supabase } from './supabase'

/**
 * Ask the backend to send the WhatsApp message for a saved bill.
 *
 * Deliberately fire-and-forget: recording a bill must never fail or stall
 * because Meta is slow or down. The outcome is recorded server-side in
 * whatsapp_sends and surfaced on the bill afterwards.
 *
 * Only the bill id is sent. All message content is derived server-side.
 */
export function sendBillWhatsApp(billId: number): void {
  if (!Number.isFinite(billId) || billId <= 0) return

  void supabase.functions
    .invoke('send-bill-whatsapp', { body: { bill_id: billId } })
    .catch(() => {
      // Swallowed on purpose. A failure here is visible on the bill's
      // WhatsApp status, and must not surface as a save error.
    })
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/lib/whatsapp.test.ts`

Expected: PASS, 4 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/whatsapp.ts src/lib/whatsapp.test.ts
git commit -m "feat(whatsapp): add fire-and-forget client send helper"
```

---

### Task 7: Wire the three save paths

**Files:**
- Modify: `src/pages/NewSale.tsx` (import, plus after the `bill_lines` insert near line 234)
- Modify: `src/pages/LogReturn.tsx` (import, plus after its `bill_lines` insert)
- Modify: `src/pages/RecordPayment.tsx:83` (capture the insert result, then call)

**Interfaces:**
- Consumes: `sendBillWhatsApp(billId: number): void` from Task 6.
- Produces: nothing consumed by later tasks.

- [ ] **Step 1: Wire NewSale**

Add the import alongside the existing imports in `src/pages/NewSale.tsx`:

```ts
import { sendBillWhatsApp } from '../lib/whatsapp'
```

Find the insert path's `bill_lines` insert (around line 234) and add the call after the error check, immediately before `navigate`:

```ts
    const { error: linesError } = await supabase.from('bill_lines').insert(lineRows)
    setSaving(false)
    if (linesError) {
      setError(linesError.message)
      return
    }
    // Lines must exist before sending — the message summarises them.
    sendBillWhatsApp(billRow.id)
    navigate(`/commercial/customers/${customerId}`)
```

Do **not** add a call to the `editing` branch higher in the same function. Editing an existing bill must not re-message the customer.

- [ ] **Step 2: Wire LogReturn**

Add the same import to `src/pages/LogReturn.tsx`:

```ts
import { sendBillWhatsApp } from '../lib/whatsapp'
```

After its `bill_lines` insert succeeds and before its `navigate`, add:

```ts
    sendBillWhatsApp(bill.id)
```

The bill variable there is named `bill` (see `LogReturn.tsx:117`), not `billRow`.

- [ ] **Step 3: Wire RecordPayment**

`src/pages/RecordPayment.tsx:83` currently discards the inserted row. Capture it:

```ts
    let billRow: { id: number }
    try {
      billRow = await insertBillWithRetry({
        customer_id: customerId,
        type: 'payment',
        total_amount: amountNum,
        paid: true,
        created_by: session?.user.id,
        created_at: timestamp,
        method,
        note: note.trim() || null,
        surrender: false,
      })
    } catch (error: any) {
      setSaving(false)
      setError(error.message)
      return
    }
    setSaving(false)
    sendBillWhatsApp(billRow.id)
    navigate(`/commercial/customers/${customerId}`)
```

Add the import:

```ts
import { sendBillWhatsApp } from '../lib/whatsapp'
```

Payments have no `bill_lines`, so the call goes straight after the header insert.

- [ ] **Step 4: Type-check and test**

Run: `npx tsc -b && npm test`

Expected: both pass.

- [ ] **Step 5: Verify end to end in the browser**

Start the dev server, sign in, and record a real sale for the one customer enabled in Task 5 Step 8.

Expected: the bill saves and navigates as before, and the WhatsApp message arrives on the whitelisted phone within a few seconds.

Then record a sale for any customer still disabled. Expected: saves normally, no message, and a `skipped`/`disabled` row in `whatsapp_sends`.

- [ ] **Step 6: Commit**

```bash
git add src/pages/NewSale.tsx src/pages/LogReturn.tsx src/pages/RecordPayment.tsx
git commit -m "feat(whatsapp): send message on sale, return and payment save"
```

---

### Task 8: Status display and retry

**Files:**
- Create: `src/hooks/useWhatsAppSends.ts`
- Create: `src/components/WhatsAppStatus.tsx`
- Modify: `src/pages/CustomerDetail.tsx`

**Interfaces:**
- Consumes: `WhatsAppSend` type (Task 1), `sendBillWhatsApp` (Task 6).
- Produces: `useWhatsAppSends(billIds: number[]): { data: Record<number, WhatsAppSend>; refetch: () => void }` and `<WhatsAppStatus send={...} onRetry={...} />`.

- [ ] **Step 1: Write the hook**

Create `src/hooks/useWhatsAppSends.ts`:

```ts
import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { WhatsAppSend } from '../types/db'

/**
 * Latest whatsapp_sends row per bill. One row per attempt is stored, so the
 * newest row is the current status.
 */
export function useWhatsAppSends(billIds: number[]) {
  const [data, setData] = useState<Record<number, WhatsAppSend>>({})
  const key = billIds.join(',')

  const load = useCallback(async () => {
    if (billIds.length === 0) {
      setData({})
      return
    }
    const { data: rows } = await supabase
      .from('whatsapp_sends')
      .select('*')
      .in('bill_id', billIds)
      .order('id', { ascending: false })

    const latest: Record<number, WhatsAppSend> = {}
    for (const row of (rows ?? []) as WhatsAppSend[]) {
      if (!latest[row.bill_id]) latest[row.bill_id] = row
    }
    setData(latest)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])

  useEffect(() => {
    void load()
  }, [load])

  return { data, refetch: load }
}
```

- [ ] **Step 2: Write the status component**

Create `src/components/WhatsAppStatus.tsx`:

```tsx
import type { WhatsAppSend } from '../types/db'

interface Props {
  send: WhatsAppSend | undefined
  onRetry: () => void
  onEnable: () => void
  onAddPhone: () => void
}

export function WhatsAppStatus({ send, onRetry, onEnable, onAddPhone }: Props) {
  if (!send) return null

  if (send.status === 'sent') {
    return <span className="text-[11px] font-bold text-[#2E8B57]">✓ Sent on WhatsApp</span>
  }

  if (send.status === 'failed') {
    return (
      <span className="text-[11px] font-bold text-muted">
        ⚠ Not sent — {send.reason ?? 'unknown error'}{' '}
        <button onClick={onRetry} className="underline text-accent">Retry</button>
      </span>
    )
  }

  if (send.reason === 'disabled') {
    return (
      <span className="text-[11px] font-bold text-muted">
        WhatsApp off for this customer{' '}
        <button onClick={onEnable} className="underline text-accent">Turn on</button>
      </span>
    )
  }

  if (send.reason === 'no_phone' || send.reason === 'invalid_phone') {
    return (
      <span className="text-[11px] font-bold text-muted">
        {send.reason === 'no_phone' ? 'No phone number' : 'Phone number not valid'}{' '}
        <button onClick={onAddPhone} className="underline text-accent">Add phone</button>
      </span>
    )
  }

  // not_applicable / no_customer — nothing worth showing.
  return null
}
```

- [ ] **Step 3: Wire it into CustomerDetail**

In `src/pages/CustomerDetail.tsx`, add the imports:

```ts
import { useWhatsAppSends } from '../hooks/useWhatsAppSends'
import { WhatsAppStatus } from '../components/WhatsAppStatus'
import { sendBillWhatsApp } from '../lib/whatsapp'
```

Where the page already has the customer's bills in scope, add:

```ts
  const billIds = bills.map((b) => b.id)
  const { data: sends, refetch: refetchSends } = useWhatsAppSends(billIds)
```

Then inside the bill row rendering, below the existing bill content:

```tsx
  <WhatsAppStatus
    send={sends[bill.id]}
    onRetry={() => { sendBillWhatsApp(bill.id); setTimeout(refetchSends, 2500) }}
    onEnable={async () => {
      await supabase.from('customers').update({ whatsapp_enabled: true }).eq('id', Number(id))
      sendBillWhatsApp(bill.id)
      setTimeout(refetchSends, 2500)
    }}
    onAddPhone={() => navigate(`/commercial/customers/${id}/edit`)}
  />
```

Match the surrounding variable names in that file — the bills array and the customer id param may be named differently; adapt rather than renaming existing code.

The `setTimeout` refetch is deliberate: the send is fire-and-forget, so the row appears a moment after the call returns.

- [ ] **Step 4: Type-check and test**

Run: `npx tsc -b && npm test`

Expected: both pass.

- [ ] **Step 5: Verify in the browser**

Open a customer with recent bills.

Expected: a sent bill shows "✓ Sent on WhatsApp"; a bill for a disabled customer shows "WhatsApp off for this customer" with a working "Turn on" that both enables and sends.

- [ ] **Step 6: Commit**

```bash
git add src/hooks/useWhatsAppSends.ts src/components/WhatsAppStatus.tsx src/pages/CustomerDetail.tsx
git commit -m "feat(whatsapp): show send status with retry on bills"
```

---

### Task 9: Opt-in controls

**Files:**
- Modify: `src/pages/AddCustomer.tsx`
- Modify: `src/pages/Customers.tsx`

**Interfaces:**
- Consumes: `customers.whatsapp_enabled` (Task 1).
- Produces: nothing consumed by later tasks.

**Important:** the existing `owner update customers` RLS policy restricts customer updates to owners. Staff accounts will see these controls fail. Show them read-only for staff rather than letting an update silently error.

- [ ] **Step 1: Add the toggle to AddCustomer**

In `src/pages/AddCustomer.tsx`, add state:

```ts
  const [whatsappEnabled, setWhatsappEnabled] = useState(false)
```

Add a control next to the phone field, following the form's existing markup conventions:

```tsx
  <label className="flex items-center gap-[10px] text-[13px] font-bold text-ink">
    <input
      type="checkbox"
      checked={whatsappEnabled}
      onChange={(e) => setWhatsappEnabled(e.target.checked)}
    />
    Send bills on WhatsApp
  </label>
```

Include it in the insert payload:

```ts
  whatsapp_enabled: whatsappEnabled,
```

Default off, matching the column default.

- [ ] **Step 2: Add bulk enable to the Customers list**

In `src/pages/Customers.tsx`, add an owner-only action that enables every customer who has a phone number:

```ts
  async function enableAllWithPhone() {
    const { error, count } = await supabase
      .from('customers')
      .update({ whatsapp_enabled: true }, { count: 'exact' })
      .not('phone', 'is', null)
      .eq('whatsapp_enabled', false)
    if (error) { setError(error.message); return }
    setAlert(`WhatsApp enabled for ${count ?? 0} customers`)
  }
```

Put it behind a confirmation, because it changes who receives messages from the next bill onward:

```tsx
  <button onClick={() => setConfirmBulk(true)}>Enable WhatsApp for all customers with a phone</button>
```

Use the existing `AlertDialog` component for the confirmation, matching how other destructive-ish actions in the codebase confirm.

- [ ] **Step 3: Type-check and test**

Run: `npx tsc -b && npm test`

Expected: both pass.

- [ ] **Step 4: Verify**

As an owner: add a customer with the toggle on, confirm `whatsapp_enabled` is true in the database. Run the bulk enable, confirm the count matches customers with phones.

As a staff account: confirm the controls either do not appear or show a clear message, rather than producing a silent RLS failure.

- [ ] **Step 5: Commit**

```bash
git add src/pages/AddCustomer.tsx src/pages/Customers.tsx
git commit -m "feat(whatsapp): add per-customer opt-in and bulk enable"
```

---

### Task 10: Production cutover

No code. Performs the switch from Meta's test number to the real business number.

**Files:** none.

**Interfaces:**
- Consumes: approved templates (Task 4), deployed function (Task 5).
- Produces: production sending.

- [ ] **Step 1: Add the real phone number**

Meta app dashboard → WhatsApp → API Setup → Add phone number. Enter the business display name, category and description, then verify by SMS or voice call.

The number must not be active on WhatsApp or the WhatsApp Business app.

- [ ] **Step 2: Generate the permanent token**

business.facebook.com → Business settings → Users → System users → Add (`bill-sender`, role Admin).

Assign both assets with full control: the app **and** the WhatsApp Business Account. Missing either causes sends to fail with a permissions error.

Generate a token with `whatsapp_business_messaging` and `whatsapp_business_management`, expiry **Never**. Copy it immediately — it is shown once.

- [ ] **Step 3: Add billing**

WhatsApp Manager → Billing → add a payment method. Required before messages reach numbers that are not whitelisted on the test number.

- [ ] **Step 4: Update the secrets**

```bash
supabase secrets set WHATSAPP_PHONE_NUMBER_ID=<production phone number id>
read -rs WA_TOKEN && supabase secrets set WHATSAPP_TOKEN="$WA_TOKEN" && unset WA_TOKEN
supabase functions deploy send-bill-whatsapp
```

- [ ] **Step 5: Send one real bill to yourself**

Record a genuine sale for your own customer record. Confirm it arrives from the business number with the correct display name.

- [ ] **Step 6: Enable customers in stages**

Enable a handful of customers first and watch a day of real bills before running the bulk enable from Task 9.

Watch for `failed` rows:

```sql
select reason, count(*) from whatsapp_sends
where status = 'failed' group by reason order by 2 desc;
```

Repeated `invalid_phone` means stored numbers need cleaning; repeated template errors mean a template was edited after approval.

- [ ] **Step 7: Confirm the messaging limit is adequate**

Unverified businesses are capped at 250 unique customers per 24 hours. Check the current tier in WhatsApp Manager → Phone numbers. Complete Meta business verification only if that ceiling is actually reached.

---

## Self-Review Notes

**Spec coverage:** migration and types (Task 1); phone normalization (Task 2); template params (Task 3); templates submitted (Task 4); Edge Function with auth, all five guards, Meta call, result row (Task 5); non-blocking client helper (Task 6); three commercial call sites, domestic deliberately excluded (Task 7); status display with retry covering all four UI states (Task 8); opt-in UI including bulk enable and the owner-only RLS caveat (Task 9); production cutover with all four prerequisites (Task 10).

**Known gap, deliberately left:** the spec's out-of-scope list (PDF attachment, delivery webhook, domestic, inbound replies) has no tasks, as intended.

**Type consistency:** `BillContext`, `TemplateName`, `buildTemplateParams`, `templateForBillType`, `formatBillDate`, `formatItems` are defined in Task 3 and used unchanged in Task 5. `normalizeIndianPhone` is defined in Task 2 and used in Task 5. `WhatsAppSend` is defined in Task 1 and used in Tasks 8. `sendBillWhatsApp` is defined in Task 6 and used in Tasks 7 and 8.

**Ordering note:** Task 4 (template approval) is asynchronous and should be started early. Tasks 5–9 can proceed against the test number without it; only Task 5 Step 8 and Task 10 depend on approval.
