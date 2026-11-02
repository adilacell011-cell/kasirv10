import type { Prisma, PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { getLogicalShiftDate } from "./business-date";

// Legacy business operations, deliberately not imported by the API entrypoint.
// No formula, retention threshold or record-selection rule is changed here.
export async function autoArchiveOldSales(prisma: PrismaClient, pinnedTransaction?: Prisma.TransactionClient) {
  const database = pinnedTransaction || prisma;
  const date30DaysAgo = new Date();
  date30DaysAgo.setDate(date30DaysAgo.getDate() - 30);
  const oldSales = await database.sale.findMany({
    where: { createdAt: { lt: date30DaysAgo } },
  });
  if (oldSales.length === 0) return;
  const groups: Record<string, { revenue: number; profit: number; commissions: number; count: number }> = {};
  for (const sale of oldSales) {
    const key = `${sale.branchId}_${getLogicalShiftDate(sale.createdAt)}`;
    if (!groups[key]) groups[key] = { revenue: 0, profit: 0, commissions: 0, count: 0 };
    if (sale.status === "success") {
      groups[key].revenue += sale.total;
      groups[key].profit += sale.totalProfit;
      groups[key].commissions += sale.totalCommission;
      groups[key].count += 1;
    }
  }
  const persist = async (tx: Prisma.TransactionClient) => {
    for (const [key, delta] of Object.entries(groups)) {
      const [branchId, date] = key.split("_");
      await tx.dailyIncomeSummary.upsert({
        where: { branchId_date: { branchId, date } },
        update: {
          revenue: { increment: delta.revenue },
          totalProfit: { increment: delta.profit },
          totalCommission: { increment: delta.commissions },
          salesCount: { increment: delta.count },
        },
        create: {
          branchId, date, revenue: delta.revenue, totalProfit: delta.profit,
          totalCommission: delta.commissions, salesCount: delta.count,
        },
      });
    }
    const oldSaleIds = oldSales.map(s => s.id);
    await tx.commission.updateMany({ where: { saleId: { in: oldSaleIds } }, data: { saleId: null } });
    await tx.saleItem.deleteMany({ where: { saleId: { in: oldSaleIds } } });
    await tx.voucherSN.updateMany({ where: { saleId: { in: oldSaleIds } }, data: { saleId: null } });
    await tx.sale.deleteMany({ where: { id: { in: oldSaleIds } } });
  };
  if (pinnedTransaction) await persist(pinnedTransaction);
  else await prisma.$transaction(persist);
  console.log(`Auto-archive completed: ${oldSales.length} transactions processed.`);
}

export async function syncCredentials(prisma: PrismaClient | Prisma.TransactionClient) {
  const pHashAdmin = await bcrypt.hash("admin123", 10);
  const pHashCashier = await bcrypt.hash("cashier123", 10);
  const branch = await prisma.branch.upsert({
    where: { id: "default-branch-id" }, update: {},
    create: { id: "default-branch-id", name: "Cabang Utama", address: "Cianjur", phone: "0812" },
  });
  await prisma.user.upsert({
    where: { username: "admin" }, update: {},
    create: { username: "admin", password: pHashAdmin, name: "Super Admin", role: "ADMIN", branchId: branch.id, status: "Active" },
  });
  await prisma.user.upsert({
    where: { username: "cashier" }, update: {},
    create: { username: "cashier", password: pHashCashier, name: "Kasir Toko", role: "CASHIER", branchId: branch.id, status: "Active" },
  });
  await prisma.globalConfig.upsert({
    where: { id: "default" }, update: {},
    create: { id: "default", allowCashierStockInput: true },
  });
  // Seeding no longer implicitly authorizes a separate historical backfill.
  console.log("Credentials and Global Config synchronized.");
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
