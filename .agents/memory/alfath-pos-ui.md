---
name: AlfathPOS frontend UI conventions
description: Durable, non-obvious UI/styling constraints for the alfath-pos frontend (giant single-file App.tsx).
---

# AlfathPOS frontend UI conventions

## Palette / dark mode is fragile — refine tokens, don't bulk-reskin
`index.css` drives theming with CSS-var tokens (`:root` + `.dark`) PLUS many hardcoded
slate/blue `!important` overrides keyed to specific tailwind utility classes (e.g.
`.dark .bg-white`, `.dark .text-slate-900`). Light mode uses tailwind utilities directly
in JSX (bg-white, slate-*, blue-*).
**Why:** a wholesale palette swap would require editing thousands of inline class usages
AND keeping the override map in sync — high regression risk. The owner is risk-averse.
**How to apply:** for palette tweaks, change the CSS-var token values (cascades safely in
dark mode) and accept tailwind utility colors as the light-mode palette. Don't try to
re-skin via class find/replace.

### Accent recolor: remap the tailwind color ramp in `@theme` (best lever)
The app's single accent is tailwind `blue-*` (bg-blue-600/text-blue-600/ring-blue-500 used
directly in JSX). To shift the WHOLE accent cohesively (e.g. blue → indigo) WITHOUT editing
the 9k-line App.tsx, override the ramp in the existing `@theme {}` block:
`--color-blue-50 … --color-blue-900: <indigo hex>`. Tailwind v4 utilities compile to
`var(--color-blue-NNN)`, so every bg/text/border/ring/gradient using that step shifts at once.
**Why:** zero JSX edits, fully reversible (delete the block), and dark-mode stays correct
because `.dark .text-blue-*` / `.dark .bg-blue-*` overrides use HARDCODED hex at higher
specificity — they win in dark mode. Caveat: that means dark-mode accent keeps the OLD hue
unless you also update those hardcoded hexes (separate small pass).

### "Kaku" (stiff) feel = over-wide UPPERCASE tracking; soften globally
Root cause of the stiff look: `tracking-widest` (used ~277x) + pervasive `uppercase` on
microlabels, plus cramped `tracking-tighter` headings. Fix centrally in index.css by
overriding `.tracking-widest`/`.tracking-wider`/`.tracking-tighter` letter-spacing with
`!important` (e.g. 0.045em / 0.025em / -0.02em). Keeps capitalization + layout; only relaxes
spacing. Reversible.

## Popups: ALL native browser dialogs are replaced by in-app modals (no URL shown)
The owner wants the app to feel like a native Android app — browser dialogs that show the
site URL/domain are not acceptable. Three layers handle this:
- `window.alert` is monkey-patched to route into the `globalAlerts` toast system (success
  keyword => green; else amber "Informasi Sistem"). So any `alert()` call still renders as a toast.
- `triggerConfirm(message): Promise<boolean>` + a confirm modal: ALL `confirm()` call sites
  were converted to `await triggerConfirm(...)` (enclosing fns/onClick made async).
- `triggerPrompt(message, default?): Promise<string|null>` + a prompt modal (resolves the typed
  value on submit, `null` on cancel): replaces `window.prompt`.
**Why:** native confirm/prompt leak the website URL and look like a webpage, not an app.
**How to apply:** never add `window.confirm`/`window.prompt`/`alert` back, and don't add
Sonner/another toast lib — use triggerConfirm / triggerPrompt / the existing globalAlerts.
The ONLY allowed native `.prompt()` is `deferredPrompt.prompt()` (the PWA install API).

## Mobile tables: opt-in `.mobile-cards` CSS pattern, list-style tables ONLY
`index.css` defines `@media (max-width:640px) table.mobile-cards { ... }` that turns rows into
labelled cards via `td::before { content: attr(data-label) }`. To convert a table: add class
`mobile-cards`, give each `<td>` a `data-label="..."`, and mark the primary cell with
`data-card-title` (full-width, no label). Preserves all JS/row logic (no markup duplication).
**Why:** lowest-risk way to get card views without rewriting row rendering.
**How to apply:** ONLY for list-style tables (one record per row). Do NOT apply to the
matrix-style stock table (branches × products) — horizontal scroll is the correct UX there.

## Global micro-interaction layer (index.css "Fase 0 micro-interaksi", at file END)
Low-risk global polish lives at the END of index.css, NOT in JSX: smooth transitions on
button/a/input/select/textarea/[role=button]; `:focus-visible` outline using `--accent`
token (`:root` indigo `#4f46e5`, `.dark` `#60a5fa`); native feel via
`-webkit-tap-highlight-color:transparent`; tactile press + `user-select:none` scoped to
real `button` ONLY; light-mode `::-webkit-scrollbar`; light modal `backdrop-filter:blur(4px)`
on `.bg-black/95|75|50`; plus a `prefers-reduced-motion` block neutralizing motion.
**Why:** centralizes app feel without editing the 9k-line App.tsx; dark-mode scrollbar (6px)
and modal blur (8px `!important`) still WIN by specificity.
**How to apply:** don't add inline per-component transitions/press effects that duplicate
these — extend this block. Keep press-scale + `user-select:none` on real `button` only so
clickable `role="button"` cards stay text-selectable.

## Restyling form fields app-wide (kolom) — element selector + !important
To change input/select/textarea appearance globally WITHOUT editing the 9k-line App.tsx,
add a block at the END of index.css targeting `input/select/textarea`. You MUST use
`!important`: Tailwind utility classes (`rounded-*`, `border-slate-*`, `focus:ring-*`,
`shadow-sm`) sit inline on every field and outrank bare element selectors, so non-!important
element rules silently lose. The app uses ONLY native `<select>` (no Radix `components/ui/select`),
so a native-element rule reliably reaches every dropdown.
**color-mix focus-ring gotcha:** if you build the focus glow with `color-mix(... var(--accent) ...)`
AND remove the outline on `:focus-visible` for fields, declare a plain `rgba()` box-shadow line
FIRST, then the color-mix line — old Android WebViews drop the color-mix declaration entirely and
would otherwise leave the field with NO visible focus indicator.
**How to apply:** exclude `[type=checkbox/radio/range/file/submit/button]`; give `.dark` its own
border/shadow (no white inset highlight). The premium-field block is self-contained & reversible.

## Restyling card/panel shadows app-wide — override `--tw-shadow`, NOT `box-shadow`
This is Tailwind v4 (4.x). To make all cards/panels/modals feel premium without editing JSX,
override the shadow scale centrally. CRITICAL: override the `--tw-shadow` custom property on
`.shadow-sm/.shadow-md/.shadow-lg/.shadow-xl/.shadow-2xl` (with `!important`), do NOT force
`box-shadow` directly. v4 composes `box-shadow: var(--tw-inset-shadow), var(--tw-inset-ring-shadow),
var(--tw-ring-offset-shadow), var(--tw-ring-shadow), var(--tw-shadow)` — forcing `box-shadow`
wipes the ring layers and kills focus rings on elements that have BOTH `shadow-*` and `ring-*`.
Setting only `--tw-shadow` keeps ring composition intact. Give `.dark .shadow-*` deeper/darker
values (rgba black) since light layered shadows vanish on dark surfaces.
**Why:** an architect review caught the box-shadow!important version suppressing focus indicators.

## Tooling
Two icon libs are installed: `lucide-react` (the app default, outline) AND `react-icons`.
For a "premium / Android" look, use Material **filled** icons from `react-icons/md` (e.g.
`MdSpaceDashboard`, `MdPointOfSale`, `MdStorefront`). Both render as React components taking
`className`, so Tailwind `w-N/h-N` sizing + `text-*`/`fill-current` color work identically —
they drop into `MenuItem`/mobile-nav with no API change. The nav (sidebar MenuItem + the
`getMobileNav()` array + the two header brand marks) uses react-icons/md; page-body icons
stay lucide. Don't blanket-swap the lucide import — only the menu/nav references were changed.
ImageMagick is available as `magick`/`convert` (NOT `sharp`) for icon cropping/resizing.
Frontend uses a base path: reference public assets in React via `import.meta.env.BASE_URL`
and use relative (no leading slash) paths in the PWA manifest / index.html icon links.

## Native control popups (select/date pickers) color
Native `<select>` option pickers and date inputs are OS-rendered — their popup sheet
ignores Tailwind classes and follows the browser `color-scheme`. On a device in OS dark
mode this made the dashboard branch dropdown ("SEMUA CABANG") render as a BLACK sheet even
though the app was in light mode. Fix: declare `color-scheme: light` on `:root` and
`color-scheme: dark` on `.dark` in index.css so native pickers/scrollbars track the in-app
theme regardless of OS setting. **Why:** you cannot style the native picker sheet/font via
CSS; color-scheme is the only lever short of replacing every <select> with a custom dropdown.
The app font is already an iOS system stack (-apple-system, SF Pro) so "iOS-style" fonts
need no change. App uses a manual `.dark` class toggle (not OS-based), so `:root` light +
`.dark` dark is correct and equal-specificity-safe (.dark declared after :root).
