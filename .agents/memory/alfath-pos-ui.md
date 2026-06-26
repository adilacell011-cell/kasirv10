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
**NEUMORPHIC INSET (matches the app-wide neu cards):** the premium-field block was flipped from a
raised/bordered look to a CARVED-IN inset (neutral grey bg + transparent border + dual inset shadow, light
& dark). Forcing a neutral bg on every input is SAFE here — audited: ZERO inputs carry their own bg color
class, so nothing semantic is clobbered. Focus appends the accent ring AFTER the inset pair (rgba line then
color-mix line, per the gotcha above).
**Button-based dropdowns are NOT inputs.** The prominent dropdowns are the LOCAL `CustomSelect` (renders a
`<button>`), unreachable by the field block. They opt IN to the same inset via a marker class on the
trigger, ring layers preserved through `var(--tw-ring-*)`, and NO `outline:none` (so the global button
focus outline always remains as a fallback). **Color-coded/status selects must opt OUT** via prop
`keepTriggerBg` or they lose their semantic background — role-coding is functional, not decoration. The
other input-based combobox (components/CustomSelect.tsx) is already covered by the field block.
**Slide toggles:** style inline (inset track + raised knob, ON=accent / OFF=neutral) and ALWAYS add `dark:`
variants — arbitrary `bg-[#hex]`/`shadow-[...]` values are NOT caught by the `.dark` override map.
**Sidebar drawer (`aside`) is EXCLUDED from every global neu/dark rule** (the card selector & `.dark
.bg-white` both carry `:not(aside)`), so it kept a plain white bg even in dark mode. To make it match the
grey neu world it must be styled INLINE with explicit `dark:` variants (bg + its header text/borders), or
the dark sidebar text goes invisible. Nav items (MenuItem): active state uses a bright accent GLOW (outer
`box-shadow` halo + icon drop-shadow) and an even brighter `active:` flash on tap — this is the owner's
requested "lampu cerah saat ditekan". Inactive items use a subtle neu-raised hover.

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

## Card style is NEUMORPHISM ("soft UI") app-wide — central, class-gated, `.app-solid` opt-out
The owner picked a clean grey neumorphic look ("Neumorphism Abu Klasik") and asked to apply it to
ALL pages + harmonize the page background. Implemented ENTIRELY in the NEUMORPHISM block at the END of
index.css (the old glassmorphism + `prefers-reduced-transparency` blocks were REPLACED). Three parts:
1. **Tokens:** `--canvas-bg` AND `--card-bg` both = `#e0e5ec` (`:root`) / `#23262e`–`#2a2d35` (`.dark`).
2. **Harmonized page field:** override plain `.bg-slate-50` and `.bg-slate-50\/50` → `#e0e5ec` (light) /
   `#23262e` (dark) so every content scroll shell + section header merges into one continuous grey field.
   SAFE because: no inputs use class `bg-slate-50`; `hover:bg-slate-50` and the opacity variants
   (`/60`,`/80`) are SEPARATE classes → untouched, so zebra rows + hovers survive. Table rows are
   `bg-white`/`bg-slate-50/60` (NOT plain, NOT rounded) → stay light/readable on the grey card.
3. **Raised cards:** selector `.bg-white:is(.rounded-lg,.rounded-xl,.rounded-2xl,.rounded-3xl,.rounded-\[32px\])`
   + the same `:not(input)...:not(.app-solid)` exclusion chain → bg `#e0e5ec`, `border-color:transparent`,
   dual neumorphic shadow (`7px 7px 16px #b8c2d0, -7px -7px 16px #ffffff`; dark `#1c1e24`/`#34373f`).
**CRITICAL — box-shadow IS written directly here (NOT via `--tw-shadow`), unlike the shadow-scale block.**
Reason: `--tw-shadow` only renders if the element ALSO has a `shadow-*` utility; many cards have none →
they'd be flat grey-on-grey (invisible). Direct `box-shadow` guarantees the extrude. Focus rings are
preserved by prepending the v4 ring layers: `box-shadow: var(--tw-ring-offset-shadow,0 0 #0000),
var(--tw-ring-shadow,0 0 #0000), <dual neu shadows> !important;`. An architect review confirmed this is sound.
**Do NOT broaden the radius list to `rounded-\[40px\]`/`rounded-\[28px\]`** — `40px` is used by bespoke
surfaces (a glow-shadow promo card, a zoom-in modal, the big POS panel) whose custom intent should
survive; `28px` cards are all `bg-*-50` (colored, not `bg-white`) so adding it does nothing. Architect
flagged the 40px collision; the proven set is exactly lg/xl/2xl/3xl/32px.
**`.app-solid` = the opt-out marker:** ANY floating dropdown/popover/menu (portal CustomSelect panel, POS
instant-search dropdown, ProductCombobox typeahead) MUST carry `app-solid` or it adopts the card neu bg.
**Escaping gotcha:** the `rounded-\[32px\]` selector must keep its backslashes — a careless `sed` once
stripped them, producing invalid `[32px]` that `:is()` drops. Edit literally.
**Login screen** has a hardcoded dark background (intentional) — the grey neu card reads as a soft floating
panel there, fine. The shift cards (App.tsx ~3596) use `bg-[#e0e5ec]` + their own arbitrary dual shadow
(not `bg-white`, so not matched by the card block) and were the approved reference for this whole style.

## Extending neu+"lampu" to elements the global card rule SKIPS (buttons/pills/spans)
The global neu card rule only matches `.bg-white.rounded-*` and excludes `button/a/input/...`,
so buttons, category pills, status spans etc. stay flat. To give them the neu look inline, set
the surface to `bg-slate-50` (it is centrally remapped to the neu base `#e0e5ec` light /
`#23262e` dark — NOT plain white) and add an arbitrary `shadow-[...]`: raised
(`4px 4px 9px #b8c2d0,-4px -4px 9px #ffffff`) or inset (`inset 3px 3px 6px ...`).
**"Lampu" (glow) = a colored `shadow-[0_0_Npx_Mpx_rgba(...)]`** — blue for the primary CTA/active
pill, and per-level hues for the category icon tiles (blue len0 / emerald len1 / purple len2,
matching the existing drillPath color logic). Active accent pills already sit on `bg-blue-600`
so they only need the glow added (no neu surface).
**ALWAYS pair arbitrary neu/structural shadows with an explicit `dark:shadow-[...]` variant** —
arbitrary `shadow-[...]` is NOT caught by the `.dark` override map, so a light-on-light neu shadow
would leak into dark mode. Pure colored glows (rgba) read fine in both modes, dark variant optional.

## Master-produk is ONE shared `<table>` with two mutually-exclusive row modes
The product page renders EITHER category-drill "group" summary rows (icon + name + "X Macam",
the floating-neu-card targets) OR leaf product rows (6 data cols: Modal/Harga/Visibilitas/Aksi),
never both at once. Mode = `isEndLevel` (computed inside the tbody IIFE):
`searchTerm || drillPath.length >= 3 || (drillPath.length === 2 && drillPath[0] !== "Aksesoris")`.
**When adapting the table per mode you MUST gate ALL of these by the SAME condition or the
table column model breaks:** `<thead>` column count (6 leaf / 2 group), `<table>` `min-w-[700px]`
(leaf only — drop it in group mode so cards are full-width, no phone h-scroll), tbody `divide-y`
(leaf only — dividers would draw lines between cards), AND the group row's `<td colSpan>` (must
equal the group-mode header count = 2, NOT 6 — architect caught a 2-col-header / colSpan-6-body
mismatch). The inline JSX condition must be byte-identical to the IIFE's isEndLevel.
**Why:** group rows are floating cards (single `<td>` wrapping a `bg-slate-50 rounded-2xl` neu card);
the leaf 6-col data table must stay a normal table. Put the scroll container on `bg-slate-50`
(neu base) so the card glows read instead of washing out on white.

## Dropdowns: two distinct custom-select components (no native `<select>` left)
All 18 native `<select>` were replaced by a portal-based custom dropdown, so the
`color-scheme` workaround above (section "Native control popups") is now mostly moot for
selects (date inputs still rely on it). TWO components share the "custom select" idea —
do NOT confuse them:
- `ProductCombobox` (imported `CustomSelect as ProductCombobox` from `./components/CustomSelect`):
  a typeahead/free-create combobox, used ONLY in the product-add form (category/brand/sub).
  API: `label/value/onChange/options:string[]`. Allows typing a new value.
- `CustomSelect` (local top-level fn in App.tsx): the fixed-option dropdown for the other 18
  spots. `createPortal` panel on document.body, fixed position, flips up when spaceBelow<240.
  API: `value`/`defaultValue`/`onChange`/`options:{value,label}[]`/`placeholder`/`hiddenId`/
  `buttonClassName`/`disabled`. Supports controlled AND uncontrolled.
**Why the naming split:** a new local `CustomSelect` collided with the pre-existing imported one;
aliasing the import to `ProductCombobox` keeps both. Adding a 3rd component named CustomSelect
will re-collide.
**hiddenId = legacy getElementById bridge:** 5 selects were read via `document.getElementById(id).value`
(e.g. `transfer-target-branch`, `dispose-reason`). When `hiddenId` is set, CustomSelect renders a
hidden `<input id=...>` mirroring its value so those reads keep working — don't "clean up" by removing
the hidden input without converting the reader to controlled state.
**Stale-value reconciliation:** uncontrolled CustomSelect has an effect that resets to defaultValue/""
when the current value drops out of `options` (mirrors native behavior for filtered lists like
transfer-target filtered by branch). Keep it; without it a stale id can be submitted while UI shows placeholder.
**Dark mode:** the portal panel deliberately uses LIGHT utility classes (`bg-white`, `bg-slate-50/60`,
`hover:bg-slate-100`, `border-slate-200`, `text-slate-700`) — all covered by `.dark` global overrides in
index.css. `divide-*` is NOT covered, so it needs explicit `dark:divide-slate-800`. Do not add
`dark:bg-slate-900` etc. (deviates from the override convention).

## Checkout success feedback (no popup)
The cashier checkout success flow does NOT show a modal/popup — the change ("kembalian")
calculator modal was removed at the user's request (they don't use it; pulsa sales are
exact-amount). On successful `createSale`: clear cart, refresh products, then show ONLY a
green success toast "Pembayaran Berhasil!". **Why:** user wants payment-success = transaction
done, no extra tap. NOTE: toasts pushed directly via `setGlobalAlerts(...)` do NOT inherit the
5s auto-dismiss — that timer lives only inside the `app-custom-alert` event handler. Any direct
setGlobalAlerts push must add its own setTimeout filter to auto-remove, or it lingers on screen.

## Responsive conventions
The app is mobile-first: base utility classes are the phone size and `md:`/`lg:` scale UP for
tablet/PC. Keep this direction — never set a desktop size as the unprefixed base.
**Why:** a few spots regressed by hardcoding desktop-only sizing (a big rupiah total, a 700px
panel min-width) which overflowed or clipped on phones.
**How to apply:** large numeric/currency text needs a responsive step + `break-words`; fixed
panel `min-w-[...]` must be `lg:`-gated (parents sometimes have `overflow-hidden` that clips it);
wide multi-column tables either live in `overflow-x-auto` or shrink fixed column widths on phones
(`w-20 md:w-32`). Inner pages are login-gated so they can't be screenshotted — audit by code.
