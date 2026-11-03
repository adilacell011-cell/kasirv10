---
name: AlfathPOS shift & day-reset boundaries
description: Why the day-reset hour (6 AM) intentionally differs from the shift-overdue hour (7 AM) — do not "fix" the mismatch.
---

# Shift & day-reset time boundaries (intentional, confirmed by owner)

Two DIFFERENT hour thresholds coexist on purpose in the frontend shift logic:

- **Day/date reset = 06:00.** `getLogicalShiftDate()` counts anything before 6 AM as the *previous* logical date, so a night shift crossing midnight stays on the same report day.
- **Shift-overdue boundary = 07:00 / 19:00.** A "Pagi" shift is flagged overdue when hour >= 19 or < 7; "Malam" when 7 <= hour < 19. Auto-detected shift type on opening uses the same 7/19 split.

**Why:** The owner confirmed the store runs 24 hours with two keepers. The day rolls over at 6 AM, while 07:00 / 19:00 are handover reference times, not mandatory closing or opening times. A morning keeper may take over at 06:40; a morning shift may close late at 19:20. Transactions belong to the actually active shift from opening until actual closing. Between 06:00–07:00, transactions belong to the night shift only while that shift is still active; after an early handover they belong to the morning shift.

**How to apply:** Do NOT harmonize the 6 AM and 7 AM thresholds — the gap is the feature. If you ever change the day-reset hour, re-confirm with the owner first; the 6 vs 7 difference is a business rule, not a bug.

## Checkout requires an opened shift

The owner confirms that normal cashier operation must require opening a shift before completing a sale. Shift closure requires confirmation and entering the actual cash amount, so accidental closure is considered unlikely. Preserve this user-facing workflow; a direct API request bypassing that UI gate is a separate server-side security concern, not evidence that the normal cashier flow permits sales without opening a shift.

**Why:** the owner clarified this is the required on-the-ground cashier workflow.

**How to apply:** do not redesign the cashier flow. Treat app/server/network interruption as recovery of the still-open server shift; keep correction of a genuinely closed shift separate. If strengthening security, enforce the same requirement at the API boundary without changing shift timing or handover rules.

Do not require keepers to wait until 07:00 / 19:00, or close shifts automatically at those hours or at the 06:00 day reset. Late-shift transactions remain allowed with a warning; early handover must not be confused with an overdue shift.

**Corollary — dashboard per-day bucketing:** Any dashboard widget that groups data by day (e.g. the 7-day trend chart) must key off `getLogicalShiftDate(d)`, NOT `formatDateLocal(d)`. `dashboardStats` already uses the logical-shift date; mixing in calendar dates causes off-by-one mismatches between widgets near the 6 AM boundary.
