---
name: Branch stock and replenishment flow
description: Owner's planned policy for cashier stock intake, branch transfers, and per-branch purchasing.
---

# Branch stock and replenishment flow

- Cashiers may manually add positive stock to their own branch only when both the global master and that branch's input permission are enabled. Use the existing persisted branch permission for independent locks; when locked, the UI and API both reject cashier intake. Cashiers must not adjust another branch's stock or perform stock-out/opname through this permission.
- Keep Owner-set purchase quantities per product and branch as the source of truth. Branch-specific sales history may suggest quantities, but Owner reviews and decides the final amounts.
- Reconcile planned quantities with actual supplier availability and the per-branch nota before preparing final branch delivery lists. A product not purchased must not remain as an expected cashier receipt; retain the plan and record its unavailable/not-bought outcome.
- New transfer-request creation is retired. Preserve and allow resolution of pending legacy requests so existing records are not stranded; current cashier transfers are sender-initiated, grouped multi-product shipments, with no Owner approval step.
- A transfer approval is not a stock movement. Reduce source available stock when the actual shipment is dispatched, track it in transit, and increase destination stock only for the quantity that receiving staff confirms. Pre-dispatch cancellations release the pending amount; post-dispatch returns only restore source stock after physical return receipt.
- For nearby branches that hand stock over in person, receiving confirmation is a second-party acknowledgment that verifies the sender's recorded quantity and prevents unlogged transfers; discrepancy handling is an exception path, not the primary purpose of confirmation.
- A transfer mismatch can be an incorrect SKU selected in the cashier app even when the physical voucher is correct; treat this as a transfer-record/SKU correction, not a physical return.
- For receipt mismatches, let the receiver record only the actual physical quantity; do not require an in-app reason or separate discrepancy flag. Preserve sent and received quantities for stock accuracy and history; handle explanations outside the app.
- For a wrong-SKU transfer record, the destination cashier reports the actual SKU and quantity, the source cashier reviews and approves, and the destination cashier confirms the actual receipt afterward. Only source approval restores the mistakenly deducted SKU and deducts the actual SKU at source; destination stock changes only on final receipt confirmation. Keep the original transfer and correction history; never auto-adjust stock on a report or rejection.
- Design the whole purchasing/transfer flow for the VPS's limited resources and mobile use: bounded database aggregation, no loading unbounded transaction history into API memory, responsive screens, and monitoring of database load, RAM, and response time.
- Preserve auditable purchase, transfer, dispatch, receipt, and discrepancy history. If detailed sales are archived, retain compact per-branch/product sales summaries needed for future restock recommendations; do not silently delete records needed for reconciliation.
- Recommended resource-safe forecast design: keep a separate rolling 30-day daily-quantity summary keyed by branch/product/day, update it incrementally in small background batches with idempotent upserts, and serve cached summaries only to Owner purchasing screens. Do not run full-history forecasting on cashier requests.
- Never prune or rewrite `DailyIncomeSummary` or `Commission` as part of product-demand summary cleanup. Their financial/bonus retention is independent and must remain intact.

**Why:** the Owner asked to keep manual branch-level purchasing decisions, control cashier intake per branch, let cashiers request transfers without Owner approval, require recipient acknowledgment of physical handovers to prevent unlogged transfers, and account for storage, RAM, responsiveness, performance, history, and archives while protecting income, bonuses, and cashier operations. For SKU mistakes, the receiver's report, sender's approval, and receiver's final confirmation preserve two-party accountability while correcting both branch ledgers. The Owner chose to keep mismatch handling simple: record actual received quantities, while discussing reasons outside the app.

**How to apply:** enforce both permission levels on the server as well as in the UI; treat automatic sales and stock calculations as recommendations, preserve the actual invoice/shipment/receipt trail, and never post destination stock before receipt confirmation.
