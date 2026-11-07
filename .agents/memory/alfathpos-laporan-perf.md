---
name: AlfathPOS Laporan Performance Architecture
description: Constraints for lightweight owner reads without changing stored historical income or business-day rules.
---

Owner summary loading must not depend on fetching the complete transaction or commission ledgers. Historical income must come from permanent daily summaries, not from the remaining transaction details.

**Why:** The app runs on the user's STB during active cashier operations. Historical details may have been archived; rebuilding history from retained sales can lose income. Loading unrelated full ledgers also defeats the benefit of pre-aggregated summaries.

**How to apply:** Keep dashboard reads separate from POS/shift/bonus mutations. Aggregate live daily totals in the database; preserve the existing 06:00 business-day boundaries and live-over-stored merge behavior. Never alter historical records as a side effect of viewing or refreshing the owner dashboard.

Archive/backfill correctness requires a separate approved audit. Do not describe the existing backfill as safely idempotent: source inspection revealed incrementing archived totals and overwriting summaries from retained sales as potential risks, not confirmed corruption on STB.

**Why:** The user approved a read-path optimization, not changes to archival or recalculation of past income. The development database does not establish the correctness of live STB history.

**How to apply:** Compare optimized reads with existing values to check parity; distinguish that from an integrity audit. Coordinate live inspection or restart separately with the user.

The owner confirmed the supplied retired SQL copy is an old schema baseline, not the current API schema. It can inform offline legacy 06:00 reconciliation but must not be assumed migration-ready or representative of current production.

**Why:** The dump's structure lacks current idempotency schema, and the owner confirmed its account data is obsolete.

**How to apply:** Keep it as a legacy-only reference. Do not restore or migrate it into a live/shared database; require isolated QA and separate approval for any import or schema operation.
