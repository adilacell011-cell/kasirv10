---
name: AlfathPOS app-wide theme remap
description: How to re-skin the entire alfath-pos app via centralized Tailwind v4 @theme ramp remaps, and what bypasses it
---

# AlfathPOS: app-wide re-skin via centralized token remap

To shift the whole app's look without touching ~9600 lines of JSX, edit ONLY
`artifacts/alfath-pos/src/index.css`. The high-leverage levers:

- In the Tailwind v4 `@theme` block, **remap whole color ramps**: the app uses
  `blue-*`(primary accent) + `indigo-*` for accent and `slate-*` as the neutral
  backbone. Redefining `--color-blue-*`, `--color-indigo-*`, `--color-slate-*`
  re-tints every utility (bg/text/border/ring/gradient) at once. `emerald-*`
  stays as the success/green color.
- Semantic CSS vars in `:root`/`.dark` (`--canvas-bg/--card-bg/--text-main/
  --text-mute/--border-color/--input-bg/--accent`) and the scrollbar thumb.
- The big stack of `.dark .<utility>` `!important` overrides (table headers,
  hover rows, accent wells, accent text) hardcode HEX/RGBA — these must be
  edited at the source; remapping `@theme` does NOT reach them.

## What the @theme remap does NOT catch (must edit by hand)
- **Inline/recharts hex** in `App.tsx` (e.g. chart `palette`, `CartesianGrid`
  stroke, axis `tick.fill`, tooltip `cursor`/`contentStyle.border`) — these are
  JS string literals, not Tailwind classes.
- **Hardcoded HEX/RGBA inside the `.dark` override rules** in index.css.
- **The login app-icon** is a baked PNG (`public/app-icon-512.png`); its color
  cannot be changed with CSS — regenerating the asset is a separate decision.

## Build gotcha — CSS comments inside `@theme`
A `*/` sequence anywhere in a comment inside the `@theme` block terminates the
comment early and breaks the Tailwind v4 build with: "`@theme` blocks must only
contain custom properties or `@keyframes`." Writing `blue-*/indigo-*` in a
comment triggers it. **Never put `*/` (e.g. glob-slash) inside an @theme comment.**

## Contrast note
The "Fresh & Friendly" reference muted greige `#7D8F8A` is only ~3.4:1 on white
(below AA). Use a darker greige-teal (~`#66726d`) for `--text-mute` and keep
`slate-400/500` near the original luminance so small metadata text stays legible.
