# 2.0 Redesign — Design System (apply consistently to every screen)

Warm "Claude editorial" aesthetic. Tailwind only, no new libraries. Fonts:
Space Grotesk (`font-display`) for headings/numbers, Manrope (body, default).
Design for non-technical shop staff: large tap targets, clear labels, high contrast.

## Surfaces & elevation
- Page background is warm paper (`bg-cream` = #F4EFE6). Page wrapper: `p-5 pt-3`, and `pb-[110px]` on bottom-tab screens (Home/Customers/Activity/Account), `pb-10` on pushed screens (forms/detail).
- Cards are **white with soft shadow, NOT hard borders**. Use `bg-surface shadow-card rounded-[18px]` (or `rounded-[20px]`). Remove `border border-[#EFE7D8]` / `border-borderMuted` on cards and replace with `shadow-card`. (Inputs keep their 1.5px border — see below.)
- Dark/feature cards: use the `HeroCard` component (gradient `from-inkSoft to-ink`, `shadow-float`) or `bg-ink`.

## Buttons
- Primary CTA: `bg-gradient-to-br from-accentSoft to-accent text-white shadow-glow rounded-[16px] h-[54px] font-bold active:scale-[0.99] transition`.
- Secondary: `bg-surface shadow-card text-ink rounded-[16px] h-[54px] font-bold` OR `border-[1.5px] border-borderMuted`.
- Return actions may use green (#2E8B57) tint; payment blue (#3B6EA5); keep per-action color semantics.

## Inputs & selects
- `h-[52px] w-full rounded-[16px] border-[1.5px] border-borderMuted bg-surface px-4 font-semibold text-ink shadow-card`.
- Do NOT add focus classes — global focus ring is handled in index.css.
- Field label above input: `mb-2 text-xs font-bold uppercase tracking-[0.6px] text-muted`.

## Typography
- Page title: `font-display text-[26px] font-bold tracking-[-0.5px] text-ink`.
- Section header: `font-display text-[18px] font-bold tracking-[-0.3px] text-ink`.
- Small caps label: `text-[11px] font-bold uppercase tracking-[0.5px] text-subtle` (or text-muted).
- Numbers/amounts/money: `font-display font-bold`. Use `formatCurrency` for money.
- Muted secondary text: `text-subtle` (#A79C8D) or `text-muted`.

## Color semantics
accent #E4571B (sales/primary), accentSoft #F26B2C, green #2E8B57 (returns/settled/full),
blue #3B6EA5 (payments), danger #C23B22 (owed/out-of-stock), amber #9A6A1A on #FBF0DD (warnings).
Icon-chip tints: accent #FBEDE4, green #EAF4EE, blue #E8EEF6, danger #FBE9E4, neutral #EDE7DA.

## Per-product treatment (IMPORTANT — the app now has 2 products)
Wherever a screen shows cylinder counts, split by product. Label each product with a
small dark pill: `rounded-lg bg-ink px-[10px] py-[4px] font-display text-[13px] font-bold text-white`.
See Home.tsx's "Cylinders" section and its per-product cards as the reference pattern.

## Empty states
White card, centered muted text: `rounded-[18px] bg-surface px-4 py-8 text-center text-sm font-medium text-subtle shadow-card`.

## Hard rules
- Change PRESENTATION ONLY. Do not alter hooks, event handlers, validation, routes, data shapes, or business logic.
- Keep all existing functionality identical.
- Verify: `npx tsc -b --noEmit` = 0 errors AND `npm run build` succeeds.
- Reference already-redesigned files for exact patterns: src/pages/Home.tsx, src/pages/Login.tsx, src/pages/Customers.tsx, src/components/HeroCard.tsx, src/components/StatusPill.tsx.
