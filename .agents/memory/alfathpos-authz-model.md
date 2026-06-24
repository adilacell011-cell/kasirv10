---
name: AlfathPOS authorization & realtime scoping model
description: How auth/role enforcement and socket.io branch scoping are meant to work in AlfathPOS, and which routes may be admin-gated safely
---

# AlfathPOS authorization & realtime scoping model

## REST authorization is permissive by design
Most mutating routes in the api-server are guarded only by `authenticateToken`
(any logged-in user), NOT by role.

**Why:** cashiers legitimately perform core POS operations — sales, refunds, stock
adjustments/transfers, etc. Branch context is largely client-driven. A code review will
flag this whole surface as "broken access control / missing RBAC."

**How to apply:** do NOT blanket-lock POS mutation/read routes (products, branches,
stocks adjust/transfer, transactions, refunds, incentives, broad GETs) to ADMIN-only
without first confirming the intended role matrix with the owner — it changes app
function and breaks cashier flows. A real fix is a deliberate RBAC + server-side
branch-scoping redesign, which is its own task.

**Safe to admin-gate (clear abuse, not normal cashier function):** user mutations
(role self-escalation) and destructive bulk wipes. The login route must never carry a
master-password bypass or a hardcoded JWT secret.

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
