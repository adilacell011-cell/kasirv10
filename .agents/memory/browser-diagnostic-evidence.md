---
name: Browser diagnostic evidence
description: Attribute console and connection failures using page-scoped evidence, not shared log labels alone.
---

Treat a console entry ending in `{}` as insufficient evidence of an HTTP failure or its origin. Correlate page-scoped console locations, request failures, timestamps, and API logs before blaming application logic or the preview infrastructure.

**Why:** read-only diagnostics found healthy requests on the instrumented page while earlier preview logs contained uncorrelated load-error labels. A browser transport failure has no HTTP status; induced offline behavior cannot establish the cause of an earlier unrecorded outage.

**How to apply:** keep natural failures separate from deliberately induced failures. Record `requestfailed` transport details separately from response status codes. Distinguish Vite HMR, Engine.IO polling, an actual WebSocket upgrade, and business events. Never include auth headers, tokens, session identifiers, or raw credential payloads in evidence.
