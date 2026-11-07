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

App is a PWA via `vite-plugin-pwa` (`registerType: "autoUpdate"`, workbox `skipWaiting`+`clientsClaim`). The service worker is only active in the built/published app (disabled in vite dev). On 2026-11-07, the Owner confirmed that clearing Chrome site data immediately made the newly deployed UI visible.
**Why:** a deployed image can be correct while an installed PWA or browser keeps serving the old cached bundle.
**How to apply:** if the Web image tag/digest is verified but UI still looks old, test a private tab and clear Chrome site storage/PWA data, then fully close and reopen the app before changing application code.

## PWA update delivery and HTTP caching

Keep the app shell and PWA control files (`index.html`, `sw.js`, `registerSW.js`, and the web manifest) revalidated or uncached by the web server. Long-lived immutable caching is appropriate only for Vite's content-hashed `/assets/` files. The existing auto-update service worker still needs to be able to fetch its new script after a web image update.

**Why:** service-worker auto-update does not prevent the browser or reverse proxy from serving a stale HTML shell or registration script from its ordinary HTTP cache; users should not need to erase Chrome site data after routine releases.

**How to apply:** preserve these cache headers in the Nginx configuration copied into the Web image. Verify both control-file revalidation and hashed-asset caching when changing deployment serving rules; do not mark the whole site immutable.
