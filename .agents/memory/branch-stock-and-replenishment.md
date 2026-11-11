---
name: Branch stock and replenishment flow
description: Owner's planned policy for cashier stock intake, branch transfers, and per-branch purchasing.
---

# Branch stock and replenishment flow

- Cashiers may manually add positive stock to their own branch while Owner has input enabled for that branch. Owner must be able to lock or reopen cashier stock input independently per branch; when locked, the UI and API both reject cashier intake. Cashiers must not adjust another branch's stock or perform stock-out/opname through this permission.
- Keep Owner-set purchase quantities per product and branch as the source of truth. Branch-specific sales history may suggest quantities, but Owner reviews and decides the final amounts.
- Reconcile planned quantities with actual supplier availability and the per-branch nota before preparing final branch delivery lists. A product not purchased must not remain as an expected cashier receipt; retain the plan and record its unavailable/not-bought outcome.
- Support both sender-initiated transfers and destination-branch requests through one workflow. The requesting cashier sets the requested quantity; Owner approval is not required. The source-branch cashier may accept, adjust, or reject based on their own branch's needs and stock; a sender may also initiate a shipment directly.
- A transfer approval is not a stock movement. Reduce source available stock when the actual shipment is dispatched, track it in transit, and increase destination stock only for the quantity that receiving staff confirms. Pre-dispatch cancellations release the pending amount; post-dispatch returns only restore source stock after physical return receipt.
- Design the whole purchasing/transfer flow for the VPS's limited resources and mobile use: bounded database aggregation, no loading unbounded transaction history into API memory, responsive screens, and monitoring of database load, RAM, and response time.
- Preserve auditable purchase, transfer, dispatch, receipt, and discrepancy history. If detailed sales are archived, retain compact per-branch/product sales summaries needed for future restock recommendations; do not silently delete records needed for reconciliation.
- Recommended resource-safe forecast design: keep a separate rolling 30-day daily-quantity summary keyed by branch/product/day, update it incrementally in small background batches with idempotent upserts, and serve cached summaries only to Owner purchasing screens. Do not run full-history forecasting on cashier requests.
- Never prune or rewrite `DailyIncomeSummary` or `Commission` as part of product-demand summary cleanup. Their financial/bonus retention is independent and must remain intact.

**Why:** the Owner asked to keep manual branch-level purchasing decisions, control cashier intake per branch, let cashiers request transfers without Owner approval, require branch-to-branch stock to be checked at dispatch and receipt, and account for storage, RAM, responsiveness, performance, history, and archives while protecting income, bonuses, and cashier operations.

**How to apply:** treat automatic sales and stock calculations as recommendations, preserve the actual invoice/shipment/receipt trail, and never post destination stock before receipt confirmation.
