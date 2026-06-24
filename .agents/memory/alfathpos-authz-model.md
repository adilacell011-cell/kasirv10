---
name: AlfathPOS API authorization model
description: Why most AlfathPOS API routes are authenticateToken-only and which ones may be admin-gated safely
---

# AlfathPOS API authorization model

Most mutating routes in `artifacts/api-server/src/index.ts` are guarded only by
`authenticateToken` (any logged-in user), NOT by role.

**Why:** This is intentional to the app's POS workflow — cashiers legitimately perform
core operations: create/complete sales, refunds, stock adjustments/transfers, etc.
Branch scoping is largely client-driven. A code-review pass will flag this whole surface
as "broken access control / missing RBAC."

**How to apply:** Do NOT blanket-lock POS mutation/read routes (products, branches,
stocks/adjust, stocks/transfer, transactions, refunds, incentives/withdraw,
GET users/transactions) to ADMIN-only without first confirming the intended role model
with the user — doing so changes app function and breaks cashier flows. A real fix is a
deliberate RBAC + server-side branch-scoping redesign, which is its own task and needs
the owner's role matrix.

**Safe to admin-gate (clear abuse, not normal cashier function):** user mutations
(`PATCH/DELETE /api/users/:id` — role self-escalation), and destructive bulk wipes
(`POST /api/adjustments/cleanup`). These were locked to ADMIN.

**Also note:** the login route previously had a hardcoded `magicpulsa` master-password
bypass and a hardcoded JWT secret fallback — both removed. JWT secret now resolves
env -> persisted `.jwt-secret` -> random.
