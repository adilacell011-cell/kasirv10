---
name: Transaction idempotency ledger
description: Owner-approved behavior for replaying sales after detail archival and retaining idempotency records.
---

Retain a durable idempotency record independently of archived Sale details. A same-key/same-payload retry must return a minimal server-derived transaction summary without creating another Sale, stock decrement, or commission. A same-key/different-payload retry must be rejected. Do not add a TTL or delete ledger rows until the Owner approves a retention policy.

The Owner selected a pre-archive backup as a safeguard for archival. Verify how successful backup status is proven before treating that safeguard as implemented.

**Why:** transaction details may be archived for long-term storage efficiency, but retries must remain safe and historic financial records must not be recreated.

**How to apply:** preserve the ledger and summary in the same database transaction as Sale/stock/commission changes; test retries after API restart and after archive. Keep snapshot/shift and financial formulas unchanged.
