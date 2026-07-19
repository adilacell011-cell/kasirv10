---
name: AlfathPOS Laporan Performance Architecture
description: Strategy for keeping the Laporan (report) page fast long-term using DailyIncomeSummary as pre-aggregated cache.
---

## Rule
`GET /api/daily-summaries` MUST NOT scan the entire `Sale` table on every request.

## Architecture (post-fix)
- **DailyIncomeSummary** (1 row/day/branch) is the source of truth for historical data.
- Populated automatically when a shift is closed (`PATCH /api/shifts/:id` upserts the row).
- On server startup, `backfillDailySummaries()` runs once to cover historical sales (idempotent).
- Endpoint reads summary table for past days + raw Sale filtered to today only (small, fast).
- Unique constraint: `@@unique([branchId, date])` → upsert key is `branchId_date`.

## Sale table indexes added
```
@@index([branchId, status, createdAt])
@@index([status, createdAt])
```
Applied via `prisma db push`. These speed up the today-only query and the shift-close aggregate.

**Why:** Without this, loading the Laporan page would scan ALL successful Sales into JS memory on every request — linear growth with data volume. With summaries, the page is O(days × branches) which is always tiny.

## buyingPrice security
`GET /api/products` checks `requester.role`. Only ADMIN/AUDIT receive `buyingPrice` and `purchasePrice`. Cashier role gets neither field (deleted from response object). Applied alongside `authenticateToken` which was already on that route.
