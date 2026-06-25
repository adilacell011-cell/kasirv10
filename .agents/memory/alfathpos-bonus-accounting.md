---
name: AlfathPOS bonus/commission accounting model
description: How earned/withdrawn/refunded bonus is tracked and why the Commission ledger is the only source of truth.
---

# AlfathPOS bonus (komisi) accounting

## Single source of truth = the Commission ledger, per BRANCH
Claimable bonus = sum of `Commission` rows with `status = "earned"`, scoped per branch.
There is intentionally NO running counter. The `User.bonusBalance` column still exists
in the Prisma schema but is **vestigial — never read or written** by app code. Do not
re-introduce a counter; it caused two ledgers to drift.

**Why:** owner confirmed bonus is computed per branch; admin "Cairkan" must zero the
claimable balance for BOTH owner and cashier in sync. A stored `bonusBalance` counter
was only incremented on sale and decremented on refund — never on withdraw — so after a
payout the cashier kept seeing the old bonus forever, and refunds could push it negative.

## Status lifecycle and the rules each step must honor
- **Sale**: create one `Commission` row per line item, `status="earned"`, `amount =
  commissionAmount × qty` (frontend sends this as the item's `commission`; the per-item
  sum equals `Sale.totalCommission`).
- **Withdraw ("Cairkan")**: per branch, flip `earned -> withdrawn`. Claimable drops to 0.
- **Refund**: flip ONLY `earned -> refunded` (`where: { saleId, status: "earned" }`).
  Already-`withdrawn` rows (money paid out) must stay untouched. Because claimable is a
  derived sum, it can never go negative.

**How to apply:** any future change to bonus must keep claimable derivable from the
ledger. Real-time sync uses a `commissionsUpdated` socket event emitted on withdraw and
refund; the frontend `socket.on("commissionsUpdated", loadData)` re-fetches the summary.
Cashier "Saldo Bonus Saya" reads `commissionsSummary.totalEarned` (branch earned total),
NOT `profile.bonusBalance`.

## Bonus/income are never destroyed by deletion or archival
Owner rule: "bonus tidak boleh berkurang kecuali refund atau dicairkan" — bonus only
decreases via a refund (earned→refunded) or a withdrawal (earned→withdrawn). NOTHING else
may delete or reduce Commission rows.
- **Product "delete" = SOFT delete (archive).** `DELETE /api/products/:id` sets
  `status="ARCHIVED"`; it must NEVER cascade-delete commissions/saleItems/sales. `GET
  /api/products` filters `status:"ACTIVE"` so archived products vanish from the catalog,
  while transaction/commission GETs include the `product` relation so names still resolve
  for archived products (relation fetch ignores the ACTIVE filter).
- **Auto-archive of old sales** (`autoArchiveOldSales`, age-based >30d, runs on boot +
  every 12h) aggregates into `DailyIncomeSummary`, then deletes `Sale`/`SaleItem`. It must
  UNLINK ALL commissions (`saleId=null`) and delete NONE — do not re-add a deleteMany for
  withdrawn/refunded rows "to keep DB lean"; that silently shrinks bonus history.
- **Branch delete** (`DELETE /api/branches/:id`) wipes commissions, so it is guarded:
  blocked (400) if the branch has ANY sales/shifts/adjustments OR `commission.count>0`
  (the commission guard matters because archived commissions keep `branchId` after
  `saleId` is nulled). Income stays synced because the income report merges
  `DailyIncomeSummary` + remaining active sales.
**Why:** product/branch/transaction deletion previously hard-deleted Commission rows,
violating the owner rule and desyncing daily/weekly/historical bonus & income reports.
