# JobMatch UI conventions

Tokens and primitives live in `src/app/globals.css` (Tailwind v4 `@theme` + `@utility`).
Structural helpers live in `src/app/components/ui.tsx`.

## Palette
- `navy` #102B39 (headers, titles, primary dark surfaces) · `navy-700`, `navy-800`
- `teal` #24A8A2 (primary action) · `teal-600` hover · `teal-50` tint
- `sky` #11AEFF (accent / secondary action) · `sky-600` hover · `sky-50` tint
- `ink` #232323 text · `ink-600` secondary text · `ink-400` muted
- `line` #E6EBF0 borders · `canvas` #F6F9FB page background · `surface` #FFF cards

Use these names (`bg-navy`, `text-ink-600`, `border-line`…) — never raw hex in components.

## Primitives (compose base + modifier)
- Layout: `jm-page` (container + vertical padding), `jm-container`
- Cards: `jm-card` (+ `jm-card-hover` for clickable cards), padding `p-5 sm:p-6`
- Headings: `jm-title` (h1), `jm-subtitle`, `jm-h2`, `jm-muted`
- Buttons: `jm-btn` + one of `jm-btn-primary | jm-btn-accent | jm-btn-navy | jm-btn-secondary | jm-btn-ghost | jm-btn-danger`; size: `jm-btn-sm`, square: `jm-btn-icon`
- Forms: `jm-label`, `jm-input`, `jm-input jm-select`, textarea uses `jm-input`
- Chips: `jm-chip` + `jm-chip-teal | jm-chip-sky | jm-chip-navy`
- Alerts: `jm-alert` + `jm-alert-ok | jm-alert-err | jm-alert-info`
- Tables: `<table class="jm-table">` (navy header, hover rows); wrap in `overflow-x-auto`
- Hero: `jm-hero` (navy gradient block), skeleton: `jm-skeleton`
- React: `PageHeader`, `Card`, `EmptyState`, `Spinner`, `SignInGate` from `components/ui.tsx`

## Rules
- Radii: cards `rounded-card` (24px), controls `rounded-control` (14px), chips `rounded-full`.
- Spacing rhythm: sections `space-y-6`, grids `gap-4 sm:gap-5`.
- Responsive: mobile-first; stack below `sm`, 2 columns at `md`, 3 at `lg`. Never fixed pixel widths on containers.
- Direction: Hebrew pages set `dir="rtl"` on their root; English pages stay LTR. Use logical utilities (`ps-/pe-/ms-/me-/text-start/rounded-s-`) so both work.
- Don't change data flow, API calls, state or copy — presentation only.
