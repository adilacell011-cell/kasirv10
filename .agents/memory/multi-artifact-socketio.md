---
name: Multi-artifact socket.io routing
description: How to route same-origin socket.io traffic when frontend and backend are separate artifacts behind the path proxy.
---

A frontend that connects with `io()` (no URL) uses the same origin and the default
path `/socket.io`. In a multi-artifact workspace the proxy routes by path, so by
default `/socket.io` goes to the frontend artifact (the one mounted at `/`), not the
backend, and the handshake fails.

**Rule:** add `/socket.io` to the backend (api) artifact's `[[services]] paths`
alongside `/api`. Edit the toml via `verifyAndReplaceArtifactToml` (write a sibling
`.replit-artifact/artifact.edit.toml`, then replace) — never edit `artifact.toml`
directly.

**Why:** the iframe preview is a path-based proxy; routes are matched per path and
forwarded to the owning artifact's localPort. Without the explicit path, realtime
silently breaks while plain HTTP `/api` works.

**How to apply:** any time a separate frontend artifact talks to a separate backend
artifact over websockets/socket.io on the same origin. Verify with
`curl "https://$REPLIT_DEV_DOMAIN/socket.io/?EIO=4&transport=polling"` — a `0{"sid":...}`
response means routing is correct.
