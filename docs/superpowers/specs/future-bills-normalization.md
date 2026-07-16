# Future project (parked): bills/lines + purchases/lines normalization

**Status:** Deferred on 2026-07-16. Do NOT start until a real trigger appears (below).

## The idea

Replace the flat ledger with a proper header + line-items model:

```
bills / bill_lines          purchases / purchase_lines
  bill: customer, date,        purchase: supplier, date,
        paid, method, total              paid, method, total
  bill_line: product, qty,     purchase_line: product, qty,
             empties, amount,                 empties_given, amount
             outright
```

Returns (multi-size) and payments (money-only) would need their own homes too — either
`returns`/`return_lines` + `payments`, or a small retained ledger for those two types.

## Why it was deferred

- **No feature needs it yet.** When scoped, there was no concrete capability driving it —
  it was pure structural preference.
- **It fights the "keep it simple" goal.** It goes from 2 ledger tables to 4–5, and
  forces a rewrite of all 7 views and all read screens.
- **High risk, zero visible benefit.** A destructive reshape of live business data with no
  change to what users see.

The flat `transactions` + `bill_id` model is a legitimate ledger pattern and works fine.

## Triggers that WOULD justify doing it

Start this project (its own brainstorm → spec → implementation) if you want:

- **Printable per-bill invoices/receipts** — a bill as one document with its own number,
  total, and payment status.
- **Editing a whole bill as a unit** — add/remove/change line items together.
- **Bill-level totals, discounts, or payment reconciliation** stored on the bill itself.

Until then, the audit-cleanup design
(`2026-07-16-schema-audit-cleanup-design.md`) keeps the schema clean without this cost.
