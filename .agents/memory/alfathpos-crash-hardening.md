---
name: AlfathPOS api-server crash hardening
description: Why the api-server keeps running on uncaught errors, and the validate-then-normalize rule for numeric inputs.
---

# AlfathPOS api-server robustness decisions

## Process-level handlers are log-and-stay-alive (intentional)
`process.on("uncaughtException")` and `process.on("unhandledRejection")` only LOG;
they do NOT `process.exit()`.

**Why:** this is a multi-branch POS — if the API process dies, every cashier goes
offline and sales are lost. Staying up through a stray error is preferred over a clean
crash. There is also a final 4-arg Express error middleware (registered just before
`listen` in `startServer`) as a last-resort 500.

**How to apply:** keep these non-exiting unless real state-corruption from a swallowed
fault shows up; if you ever switch to exit-on-uncaught, pair it with a process manager
that restarts instantly, and re-confirm with the owner.

## Numeric request fields: validate AND normalize, never write raw
Money/qty fields arrive as strings or numbers. Helpers `toFiniteNumber`,
`toPositiveInt`, `toNonNegativeNumber` both validate and coerce.

**Why:** a previous pass only *checked* values but still wrote the raw body field. A
legitimate `"2"` then hit a Prisma Int column and failed at the DB layer (false 400).

**How to apply:** for any handler touching qty/price/cash, build a normalized value
(or a `normItems`/`shiftData` object) from the helpers and use THAT everywhere —
stock math, Prisma writes, and socket emits — not the raw `req.body` field. Covered:
`/api/transactions`, `/api/shifts` (POST+PATCH), `/api/stocks/adjust`,
`/api/stocks/transfer`, `/api/products`.
