---
name: AlfathPOS shift & day-reset boundaries
description: Why the day-reset hour (6 AM) intentionally differs from the shift-overdue hour (7 AM) — do not "fix" the mismatch.
---

# Shift & day-reset time boundaries (intentional, confirmed by owner)

Two DIFFERENT hour thresholds coexist on purpose in the frontend shift logic:

- **Day/date reset = 06:00.** `getLogicalShiftDate()` counts anything before 6 AM as the *previous* logical date, so a night shift crossing midnight stays on the same report day.
- **Shift-overdue boundary = 07:00 / 19:00.** A "Pagi" shift is flagged overdue when hour >= 19 or < 7; "Malam" when 7 <= hour < 19. Auto-detected shift type on opening uses the same 7/19 split.

**Why:** The owner confirmed this is desired. The day rolls over at 6 AM, but the real-world keeper handover averages ~7 AM. Transactions between **06:00–07:00** must still belong to the **night (Malam)** shift (not yet "overdue"), even though they already count as the new logical day.

**How to apply:** Do NOT harmonize the 6 AM and 7 AM thresholds — the gap is the feature. If you ever change the day-reset hour, re-confirm with the owner first; the 6 vs 7 difference is a business rule, not a bug.

**Corollary — dashboard per-day bucketing:** Any dashboard widget that groups data by day (e.g. the 7-day trend chart) must key off `getLogicalShiftDate(d)`, NOT `formatDateLocal(d)`. `dashboardStats` already uses the logical-shift date; mixing in calendar dates causes off-by-one mismatches between widgets near the 6 AM boundary.
