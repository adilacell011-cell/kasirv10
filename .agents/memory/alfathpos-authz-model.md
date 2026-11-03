---
name: AlfathPOS authorization & realtime scoping model
description: How auth/role enforcement and socket.io branch scoping are meant to work in AlfathPOS, and which routes may be admin-gated safely
---

# AlfathPOS authorization & realtime scoping model

## REST authorization: role matrix is enforced server-side
RBAC is now implemented via a `requireRole(...roles)` middleware (placed after
`authenticateToken`) that reads the role ONLY from the verified JWT claim, plus
inline own-branch checks inside handlers. The owner's authoritative role matrix:

- **ADMIN** — everything.
- **AUDIT** — all stock ops on ANY branch (adjust/opname/destroy, transfer, voucher
  bulk import) + reads. NOT product/branch/user/config CRUD, NOT refund, NOT withdraw.
- **CASHIER** — create sales, ADD stock, transfer stock, refund — all scoped to their
  OWN branch only.

**Server-side scoping rules that must not regress:**
- Cashier READS are branch-scoped too, not just writes: `GET /api/transactions`,
  `/api/incentives`, `/api/shifts`, `/api/adjustments` override/ignore any client
  `branchId` and force `where.branchId = req.user.branchId` for CASHIER (ADMIN/AUDIT
  stay global). Missing this is an IDOR/tenant-isolation break a review will fail on.
- Cashier sales/refunds: branchId + cashier identity are forced from the JWT, never the
  request body (prevents spoofing another branch/cashier).
- Cashier stock adjust is ADD-ONLY: reject `newQty` (opname) and `STOCK_OUT`/negative
  `qty` (destruction) — those are AUDIT/ADMIN only. The client distinguishes the three
  flows purely by request shape: add = `{type:"STOCK_IN", qty:+n}`, opname =
  `{newQty:n}`, destroy = `{type:"STOCK_OUT", qty:-n}`.
- Shifts: open/patch = ADMIN+CASHIER (cashier forced/checked to own branch); delete =
  ADMIN only (frontend never calls delete). AUDIT cannot open shifts.
- Shopping-plans write/delete = ADMIN only (the UI's shopping-list menu is ADMIN-gated).

**Why:** a prior review flagged the whole mutating surface as broken access control;
the owner then gave the exact matrix above, so it is now enforced rather than permissive.

Cashier user-name lookup must remain available, but only for the cashier's own
branch roster. ADMIN/AUDIT retain their existing read permissions.

**Why:** cashier data sync loads the roster to resolve names; denying the endpoint
breaks compatibility, while the owner explicitly forbids cross-branch cashier reads.

**How to apply:** derive branch scope from verified identity, never request parameters.
An unassigned cashier must not fall back to global or unassigned-user results.
Products use the existing branch-visibility rule; do not require an existing stock
row, because visible zero-stock products must remain available for stock intake.

Cashiers may transfer stock between branches. Keep the general branch directory
scoped to the cashier's own branch; the transfer picker may receive only other
branches' IDs and names, not their stock or full branch records.

**Why:** the owner confirmed cross-branch transfers are part of normal operations
and confirmed the transfer flow worked again after this narrow destination lookup.

**How to apply:** derive the source branch from the verified cashier identity and
use a purpose-limited destination lookup without widening ordinary branch reads.

## Never leak password hashes through nested includes
Read endpoints that do Prisma `include: { cashier: true }` (`GET /api/transactions`,
`/api/incentives`, `/api/shifts`) return the FULL `User` row — including the bcrypt
hash — to any authenticated client.

**Why:** this is high-severity credential-material exposure; a code review will (rightly)
fail on it.

**How to apply:** map the result and strip `password` from the nested user before
sending (a small `stripPw` helper). Strip ONLY `password` so the response shape is
preserved — the frontend reads `cashier.name`, so do not switch to a narrow `select`
that drops fields it relies on. The dedicated `GET /api/users` already strips it.

The login route must never carry a master-password bypass or a hardcoded JWT secret.

## Realtime (socket.io) scoping rule
Socket room membership must be derived from VERIFIED token claims, never from
client-asserted handshake fields.

**Why:** if the server reads `socket.handshake.auth.role/branchId` directly, any client
can spoof `role:"ADMIN"` to join the global room and receive every branch's events —
the branch isolation becomes fake.

**How to apply:** authenticate the socket handshake JWT in `io.use` (same secret as the
REST API), put claims on `socket.data`, and join rooms from those. Pattern in use:
ADMIN/AUDIT → `global` room (all branches); CASHIER → `branch:<id>` only. Branch-scoped
events emit to the branch room + global room; catalog-wide product events stay global.
The frontend passes the bearer token (not role/branch) via `io({ auth: { token } })`.

## Race-safe stock decrements
Decrementing stock must use a conditional atomic update, not read-then-write.

**Why:** a read (findUnique) followed by a separate decrement lets two concurrent sales
of the last unit both pass the check and drive stock negative (oversell), even inside a
`$transaction` under READ COMMITTED.

**How to apply:** decrement with `updateMany({ where: { ...key, qty: { gte: n } }, data:
{ qty: { decrement: n } } })` and abort when `count === 0`. Applies to sales and stock
transfers.
