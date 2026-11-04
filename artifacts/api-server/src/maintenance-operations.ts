import type { Prisma, PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { getLogicalShiftDate } from "./business-date";
import { createSaleIdempotencySnapshot } from "./idempotency";

// Legacy business operations, deliberately not imported by the API entrypoint.
// No formula, retention threshold or record-selection rule is changed here.
const ARCHIVE_BATCH_SIZE = 500;

type ArchiveSale = {
  id: string;
  branchId: string;
  cashierId: string;
  createdAt: Date;
  total: number;
  totalProfit: number;
  totalCommission: number;
  status: string;
  idempotencyKeyHash: string | null;
  idempotencyPayloadHash: string | null;
};

export async function autoArchiveOldSales(
  prisma: PrismaClient,
  pinnedTransaction?: Prisma.TransactionClient,
  batchSize = ARCHIVE_BATCH_SIZE,
) {
  if (!Number.isInteger(batchSize) || batchSize < 1 || batchSize > 5000) {
    throw new Error("Archive batch size must be an integer between 1 and 5000.");
  }
  const date30DaysAgo = new Date();
  date30DaysAgo.setDate(date30DaysAgo.getDate() - 30);

  const persist = async (tx: Prisma.TransactionClient) => {
    let processed = 0;
    for (;;) {
      const candidates = await tx.sale.findMany({
        where: { createdAt: { lt: date30DaysAgo } },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        take: batchSize,
        select: {
          id: true,
          branchId: true,
          cashierId: true,
          createdAt: true,
          total: true,
          totalProfit: true,
          totalCommission: true,
          status: true,
          idempotencyKeyHash: true,
          idempotencyPayloadHash: true,
        },
      });
      if (candidates.length === 0) break;

      // Lock only the current bounded batch. Re-read after locking so a refund
      // that committed while this batch was being selected is archived by its
      // current status, not by a stale pre-refund snapshot.
      const lockedRows = await tx.$queryRaw<{ id: string }[]>`
        SELECT id FROM "Sale"
        WHERE id = ANY(${candidates.map((sale) => sale.id)}::text[])
        ORDER BY id
        FOR UPDATE`;
      const lockedIds = lockedRows.map((row) => row.id);
      if (lockedIds.length === 0) continue;
      const oldSales = await tx.sale.findMany({
        where: { id: { in: lockedIds }, createdAt: { lt: date30DaysAgo } },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        select: {
          id: true,
          branchId: true,
          cashierId: true,
          createdAt: true,
          total: true,
          totalProfit: true,
          totalCommission: true,
          status: true,
          idempotencyKeyHash: true,
          idempotencyPayloadHash: true,
        },
      }) as ArchiveSale[];
      if (oldSales.length === 0) continue;

      const groups = new Map<string, {
        branchId: string; date: string; revenue: number; profit: number; commissions: number; count: number;
      }>();
      for (const sale of oldSales) {
        const date = getLogicalShiftDate(sale.createdAt);
        const key = JSON.stringify([sale.branchId, date]);
        if (!groups.has(key)) {
          groups.set(key, { branchId: sale.branchId, date, revenue: 0, profit: 0, commissions: 0, count: 0 });
        }
        if (sale.status === "success") {
          const group = groups.get(key)!;
          group.revenue += sale.total;
          group.profit += sale.totalProfit;
          group.commissions += sale.totalCommission;
          group.count += 1;
        }
      }

      for (const group of groups.values()) {
        await tx.dailyIncomeSummary.upsert({
          where: { branchId_date: { branchId: group.branchId, date: group.date } },
          update: {
            revenue: { increment: group.revenue },
            totalProfit: { increment: group.profit },
            totalCommission: { increment: group.commissions },
            salesCount: { increment: group.count },
          },
          create: {
            branchId: group.branchId,
            date: group.date,
            revenue: group.revenue,
            totalProfit: group.profit,
            totalCommission: group.commissions,
            salesCount: group.count,
          },
        });
      }

      const archivedAt = new Date();
      for (const sale of oldSales) {
        const bySale = await tx.saleIdempotency.findUnique({ where: { saleId: sale.id } });
        const byKey = sale.idempotencyKeyHash
          ? await tx.saleIdempotency.findUnique({ where: { scopeKeyHash: sale.idempotencyKeyHash } })
          : null;
        if (bySale && byKey && bySale.id !== byKey.id) {
          throw new Error("Conflicting idempotency ledger records prevent safe Sale archival.");
        }
        const existing = byKey || bySale;
        if (existing && sale.idempotencyKeyHash && existing.scopeKeyHash !== sale.idempotencyKeyHash) {
          throw new Error("Sale and idempotency ledger key hashes do not match.");
        }
        if (existing && sale.idempotencyPayloadHash &&
            existing.payloadHash !== sale.idempotencyPayloadHash) {
          throw new Error("Sale and idempotency ledger payload hashes do not match.");
        }

        // Capture the Sale's current server-side state at archival time. This
        // keeps replay summaries aligned with the record (including a valid
        // refund status) while retaining no item or cost-price details.
        const snapshot = createSaleIdempotencySnapshot(sale);
        if (sale.idempotencyKeyHash && !existing && !sale.idempotencyPayloadHash) {
          // Do not destroy the only known replay marker if its payload binding
          // cannot be reconstructed safely.
          throw new Error("Sale with a legacy idempotency key has no payload hash; archive stopped safely.");
        }

        if (existing) {
          await tx.saleIdempotency.update({
            where: { id: existing.id },
            data: {
              state: "ARCHIVED",
              saleId: null,
              originalSaleId: sale.id,
              resultSnapshot: snapshot,
              completedAt: existing.completedAt || sale.createdAt,
              archivedAt,
            },
          });
        } else if (sale.idempotencyKeyHash && sale.idempotencyPayloadHash) {
          // Convert a pre-ledger Sale marker before deleting its source row.
          await tx.saleIdempotency.create({
            data: {
              scopeKeyHash: sale.idempotencyKeyHash,
              payloadHash: sale.idempotencyPayloadHash,
              state: "ARCHIVED",
              originalSaleId: sale.id,
              resultSnapshot: snapshot,
              completedAt: sale.createdAt,
              archivedAt,
            },
          });
        }
      }

      const oldSaleIds = oldSales.map((sale) => sale.id);
      await tx.commission.updateMany({ where: { saleId: { in: oldSaleIds } }, data: { saleId: null } });
      await tx.saleItem.deleteMany({ where: { saleId: { in: oldSaleIds } } });
      await tx.voucherSN.updateMany({ where: { saleId: { in: oldSaleIds } }, data: { saleId: null } });
      await tx.sale.deleteMany({ where: { id: { in: oldSaleIds } } });
      processed += oldSales.length;
    }
    return processed;
  };
  const processed = pinnedTransaction
    ? await persist(pinnedTransaction)
    : await prisma.$transaction(persist, { timeout: 600_000, maxWait: 5000 });
  console.log(`Auto-archive completed: ${processed} transactions processed in batches.`);
}

export async function syncCredentials(prisma: PrismaClient | Prisma.TransactionClient) {
  const adminUsername = process.env.INITIAL_ADMIN_USERNAME?.trim().toLowerCase();
  const adminPassword = process.env.INITIAL_ADMIN_PASSWORD?.trim();
  const cashierUsername = process.env.INITIAL_CASHIER_USERNAME?.trim().toLowerCase();
  const cashierPassword = process.env.INITIAL_CASHIER_PASSWORD?.trim();
  if (!adminUsername || !adminPassword || !cashierUsername || !cashierPassword) {
    throw new Error("Seed requires explicit INITIAL_ADMIN_* and INITIAL_CASHIER_* environment values.");
  }
  if (adminUsername === cashierUsername) {
    throw new Error("Initial admin and cashier usernames must be different.");
  }
  const pHashAdmin = await bcrypt.hash(adminPassword, 10);
  const pHashCashier = await bcrypt.hash(cashierPassword, 10);
  const branch = await prisma.branch.upsert({
    where: { id: "default-branch-id" }, update: {},
    create: { id: "default-branch-id", name: "Cabang Utama", address: "Cianjur", phone: "0812" },
  });
  await prisma.user.upsert({
    where: { username: adminUsername }, update: {},
    create: { username: adminUsername, password: pHashAdmin, name: "Super Admin", role: "ADMIN", branchId: branch.id, status: "Active" },
  });
  await prisma.user.upsert({
    where: { username: cashierUsername }, update: {},
    create: { username: cashierUsername, password: pHashCashier, name: "Kasir Toko", role: "CASHIER", branchId: branch.id, status: "Active" },
  });
  await prisma.globalConfig.upsert({
    where: { id: "default" }, update: {},
    create: { id: "default", allowCashierStockInput: true },
  });
  // Seeding no longer implicitly authorizes a separate historical backfill.
  console.log("Credentials and Global Config synchronized.");
}

export async function bootstrapOwner(prisma: PrismaClient | Prisma.TransactionClient) {
  const username = process.env.STAGING_OWNER_USERNAME?.trim().toLowerCase();
  const password = process.env.STAGING_OWNER_PASSWORD?.trim();
  const name = process.env.STAGING_OWNER_NAME?.trim() || "Owner";
  if (!username || !password) {
    throw new Error("Owner bootstrap requires explicit STAGING_OWNER_USERNAME and STAGING_OWNER_PASSWORD.");
  }

  const existingAdmins = await prisma.user.count({ where: { role: "ADMIN" } });
  if (existingAdmins > 0) {
    throw new Error("Owner bootstrap refused: an ADMIN account already exists.");
  }
  const usernameConflict = await prisma.user.findUnique({
    where: { username },
    select: { id: true },
  });
  if (usernameConflict) {
    throw new Error("Owner bootstrap refused: the requested username already exists.");
  }

  const passwordHash = await bcrypt.hash(password, 10);
  await prisma.user.create({
    data: {
      username,
      password: passwordHash,
      name,
      role: "ADMIN",
      branchId: null,
      status: "Active",
    },
  });
  await prisma.globalConfig.upsert({
    where: { id: "default" },
    update: {},
    create: { id: "default", allowCashierStockInput: true },
  });
  console.log("Staging Owner bootstrap completed.");
}

export async function backfillDailySummaries(prisma: PrismaClient | Prisma.TransactionClient) {
  const allSales = await prisma.sale.findMany({
    where: { status: "success" },
    select: { branchId: true, createdAt: true, total: true, totalProfit: true, totalCommission: true },
  });
  const grouped: Record<string, {
    branchId: string; date: string; revenue: number; totalProfit: number; totalCommission: number; count: number;
  }> = {};
  for (const sale of allSales) {
    const dateStr = getLogicalShiftDate(sale.createdAt);
    const key = `${sale.branchId}_${dateStr}`;
    if (!grouped[key]) {
      grouped[key] = { branchId: sale.branchId, date: dateStr, revenue: 0, totalProfit: 0, totalCommission: 0, count: 0 };
    }
    grouped[key].revenue += Number(sale.total);
    grouped[key].totalProfit += Number(sale.totalProfit);
    grouped[key].totalCommission += Number(sale.totalCommission);
    grouped[key].count += 1;
  }
  for (const entry of Object.values(grouped)) {
    await prisma.dailyIncomeSummary.upsert({
      where: { branchId_date: { branchId: entry.branchId, date: entry.date } },
      create: {
        date: entry.date, branchId: entry.branchId, revenue: entry.revenue,
        totalProfit: entry.totalProfit, totalCommission: entry.totalCommission, salesCount: entry.count,
      },
      update: {
        revenue: entry.revenue, totalProfit: entry.totalProfit,
        totalCommission: entry.totalCommission, salesCount: entry.count,
      },
    });
  }
  console.log(`DailyIncomeSummary: ${Object.keys(grouped).length} entries synchronized.`);
}
