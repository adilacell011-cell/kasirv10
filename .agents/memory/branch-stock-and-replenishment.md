---
name: Branch stock and replenishment flow
description: Owner's planned policy for cashier stock intake, branch transfers, and per-branch purchasing.
---

# Branch stock and replenishment flow

- Cashiers may manually add positive stock to their own branch while Owner has input enabled. Owner must be able to lock or reopen cashier stock input; when locked, the UI and API both reject cashier intake. Cashiers must not adjust another branch's stock or perform stock-out/opname through this permission.
- Keep Owner-set purchase quantities per product and branch as the source of truth. Branch-specific sales history may suggest quantities, but Owner reviews and decides the final amounts.
- Reconcile planned quantities with actual supplier availability and the per-branch nota before preparing final branch delivery lists. A product not purchased must not remain as an expected cashier receipt; retain the plan and record its unavailable/not-bought outcome.
- Support both sender-initiated transfers and destination-branch requests through one workflow. A destination request awaits source-branch acceptance or adjustment; a sender may also initiate a shipment directly.
- A transfer approval is not a stock movement. Reduce source available stock when the actual shipment is dispatched, track it in transit, and increase destination stock only for the quantity that receiving staff confirms. Pre-dispatch cancellations release the pending amount; post-dispatch returns only restore source stock after physical return receipt.

**Why:** the Owner asked to keep manual branch-level purchasing decisions, allow cashier intake under an Owner-controlled lock, and require branch-to-branch stock to be checked at dispatch and receipt.

**How to apply:** treat automatic sales and stock calculations as recommendations, preserve the actual invoice/shipment/receipt trail, and never post destination stock before receipt confirmation.
