---
name: AlfathPOS sidebar z-index & PWA cache
description: Why the slide-out sidebar must sit far above content bars, and why UI changes appear stale on devices
---

# Sidebar drawer stacking order

The slide-out sidebar (`aside`, fixed left drawer) and its dark backdrop must paint above ALL content bars. Several content bars use `z-50` and live in the root stacking context (their positioned ancestors are all `z-auto`, so they create no stacking context and are NOT contained): the POS sub-nav header (omzet badges + Billing/Riwayat/Transfer tabs) and the mobile bottom nav (POS/SHIFT/BONUS/STOK). At equal z-index these paint over the sidebar (later in DOM), so the sidebar appeared "covered".

**Rule:** keep the sidebar backdrop and `aside` clearly above content — backdrop `z-[80]`, aside `z-[90]`. Do NOT try to fix this by lowering one content bar (e.g. POS header) at a time; other bars at `z-50` will still bleed through.
**Why:** content bars at `z-50` are not nested in a stacking context, so they compete directly with the drawer in the root context.
**How to apply:** whenever the drawer looks like content shows on top of it, raise the drawer/backdrop, don't chase individual content z-indices. Full-screen modals/toasts intentionally sit even higher (`z-[100]`..`z-[99999]`) and should stay above the drawer.

# PWA caching hides UI changes

App is a PWA via `vite-plugin-pwa` (`registerType: "autoUpdate"`, workbox `skipWaiting`+`clientsClaim`). The service worker is only active in the built/published app (disabled in vite dev). On a phone viewing the published/installed app, a code fix will NOT show until the user fully closes & reopens the app (often twice) or it is republished.
**Why:** a stale fix that "didn't work" is often just the cached old bundle, not a wrong fix.
**How to apply:** when a user reports a UI fix "still" not working on their device, suspect the SW cache — tell them to fully reopen, and republish if they are on the live app, before assuming the fix is wrong.
