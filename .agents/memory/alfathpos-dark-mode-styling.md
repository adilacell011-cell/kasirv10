---
name: AlfathPOS dark-mode-aware styling
description: How to restyle surfaces in artifacts/alfath-pos so both light and dark themes stay correct
---

# AlfathPOS theming: restyle with the standard LIGHT utility classes

`artifacts/alfath-pos/src/index.css` implements dark mode via global `!important`
overrides keyed to specific light utility classes (e.g. `.dark .bg-white` -> card bg,
`.dark .bg-slate-50` -> input bg, `.dark .text-slate-900` -> light text,
`.dark .text-slate-700` -> mute, `.dark .text-blue-600`/`.text-emerald-600` -> lighter accents,
`.dark .border-slate-200` -> border color).

**Rule:** to convert a hardcoded dark panel (`bg-slate-900`/`text-white`) into a light
surface, use the app's standard light classes — `bg-white` or `bg-slate-50`,
`text-slate-900`, `text-slate-500/600/700`, `border-slate-200`, and accents as
`*-600` (not `*-400`). Dark mode then keeps working automatically and the UI stays uniform.

**Why:** the overrides only match exact class names. So:
- Opacity variants (`bg-white/90`, `border-slate-200/80`) are NOT matched by `.dark .bg-white` —
  add an explicit `dark:` variant (e.g. toast: `bg-white/90 dark:bg-slate-900/90`).
- `hover:`/other variant classes are NOT covered either — add explicit `dark:hover:*`
  (e.g. `hover:text-slate-700 dark:hover:text-slate-200`) or dark mode gets low-contrast hovers.

**How to apply:** prefer plain light classes for solid surfaces; only reach for explicit
`dark:` variants when you need opacity/blur or a hover/variant class. App default theme is light.

**Intentionally-dark elements (leave alone):** login screen, primary dark
buttons (`bg-slate-900 hover:bg-black`), modal dim-overlay scrims, camera scanner.

**Sidebar nav is now LIGHT (white) matching the Zanex dashboard mockup** — was hardcoded
`bg-slate-900` navy, owner asked for white. It uses the light-utility pattern (`bg-white`,
`text-slate-500/900`, active item `bg-blue-600 text-white`, `hover:bg-slate-50`). Dark-safe:
`.dark .bg-white` (line ~127, NO `:not(aside)` — the `:not(aside)` is only on the separate
border rule) recolors the white aside to the navy card in dark mode automatically. Use
translucent (`/10`) or override-covered hovers; never `hover:text-slate-900` (no dark override
→ invisible on navy).
