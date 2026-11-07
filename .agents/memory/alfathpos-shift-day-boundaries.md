---
name: AlfathPOS shift, operational-day, and revenue boundaries
description: Keep the 06:00 operational reset distinct from actual shifts and the chosen 07:00 WIB Owner revenue cutoff; preserve existing 06:00 summaries.
---

# Shift, operational-day, and revenue boundaries (confirmed by owner)

Three separate time rules coexist:

- **Operational date reset = 06:00.** Existing non-revenue operational-date behavior remains distinct and must not be globally changed.
- **Shift handover reference = 07:00 / 19:00.** These are nominal schedule times, not mandatory opening or closing times.
- **Owner and daily revenue cutoff = 07:00 WIB across all branches.** The owner chose this for daily revenue; a shift crossing 07:00 can contribute sales to two daily revenue buckets while remaining one actual shift total.

**Why:** The owner confirmed the store runs 24 hours with nominal day shift 07:00–19:00 and night shift 19:00–07:00, while actual arrival and handover times may vary. Shift totals follow actual open and close times. Daily Owner revenue uses a fixed 07:00 WIB boundary, independent of shift handover.

**How to apply:** Keep operational-date and revenue-date helpers separate. Do not auto-close shifts at 06:00, 07:00, or 19:00. Use server/database time for live revenue windows, never the browser clock. The owner explicitly chose to preserve existing daily summaries built with the 06:00 cutoff and agreed to design a separate additive 07:00 summary path; this is not approval to implement a schema or code change. Do not rewrite or recalculate 06:00 history without separate approval. Before enabling 07:00 summaries, resolve archive/backfill idempotency.

## Checkout requires an opened shift

The owner confirms that normal cashier operation must require opening a shift before completing a sale. Shift closure requires confirmation and entering reported total income, so accidental closure is considered unlikely. Preserve this user-facing workflow; a direct API request bypassing that UI gate is a separate server-side security concern, not evidence that the normal cashier flow permits sales without opening a shift.

**Why:** the owner clarified this is the required on-the-ground cashier workflow.

**How to apply:** do not redesign the cashier flow. Treat app/server/network interruption as recovery of the still-open server shift; keep correction of a genuinely closed shift separate. If strengthening security, enforce the same requirement at the API boundary without changing shift timing or handover rules.

## Shift-close sales total

At checkout, the sale is paid and recorded as a completed transaction; the cashier flow does not record a separate payment method. The shift-close total must include successful transactions created from that shift's actual opening through its actual closing, and exclude failed, cancelled, or refunded transactions.

**Why:** the owner clarified that checkout is complete when products are entered and paid, and the shift total must be accurate for the actual shift interval.

**How to apply:** do not introduce payment-type splits or change revenue formulas. Preserve the success-only, actual-open-to-actual-close basis when auditing shift totals and reports.

POS/shift revenue is bounded by persisted `openTime` and actual `closeTime`; while active, use server time as the upper bound. Owner daily revenue uses a separate fixed window [07:00 WIB, next 07:00 WIB), across branches. Only `success` sales contribute; `refunded` and `cancelled` are not summed.
**Why:** Shift accounting must reflect the real cashier handover, while Owner daily income has one consistent cutoff for all branches.
**How to apply:** Keep shift totals and daily revenue aggregation distinct. Do not assign a whole crossing shift to one daily bucket, auto-close at schedule times, or change historical 06:00 summaries without separate approval.

At API closure, the cashier reports total income (`reportedIncome`), not physical cash in the drawer. The report is required and must be a finite non-negative amount; zero is valid. There is no opening cash for a shift.

**Why:** the owner explicitly clarified that the cashier enters total income, which must be compared with the server's successful-sale total; the former "physical cash" label and opening-drawer calculation were incorrect.

**How to apply:** enforce the reported total at the API boundary and calculate difference as `reportedIncome - totalSales`; keep the database column compatibility mapping if needed, do not add payment-type splits, and do not rewrite historical rows.

Do not require keepers to wait until 07:00 / 19:00, or close shifts automatically at those hours or at the 06:00 day reset. Late-shift transactions remain allowed with a warning; early handover must not be confused with an overdue shift.

**Corollary — dashboard per-day bucketing:** Any dashboard widget that groups data by day (e.g. the 7-day trend chart) must key off `getLogicalShiftDate(d)`, NOT `formatDateLocal(d)`. `dashboardStats` already uses the logical-shift date; mixing in calendar dates causes off-by-one mismatches between widgets near the 6 AM boundary.
