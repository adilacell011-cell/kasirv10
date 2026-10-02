import type { Express, RequestHandler } from "express";
import type { PrismaClient } from "@prisma/client";

// Read-only owner views. Keep the POS, shift-closing and archiving paths separate.
export function registerOwnerDashboardRoutes(
  app: Express,
  prisma: PrismaClient,
  authenticate: RequestHandler,
  authorizeOwner: RequestHandler,
  logicalDate: (date: Date) => string,
) {
  const readBranch = (value: unknown) =>
    typeof value === "string" && value.trim() ? value.trim() : undefined;

  app.get("/api/owner-dashboard", authenticate, authorizeOwner, async (req, res, next) => {
    try {
      const branchId = readBranch(req.query.branchId);
      const today = logicalDate(new Date());
      const [year, month, day] = today.split("-").map(Number);
      const start = new Date(Date.UTC(year, month - 1, day - 1, 23));
      const end = new Date(Date.UTC(year, month - 1, day, 23));

      // Sum in PostgreSQL: no individual sales are materialized in API memory.
      const [history, live] = await Promise.all([
        prisma.dailyIncomeSummary.findMany({
          where: branchId ? { branchId } : {},
          select: {
            id: true, date: true, branchId: true, revenue: true,
            totalProfit: true, totalCommission: true, salesCount: true,
          },
          orderBy: { date: "asc" },
        }),
        prisma.sale.groupBy({
          by: ["branchId"],
          where: {
            ...(branchId ? { branchId } : {}),
            status: "success",
            createdAt: { gte: start, lt: end },
          },
          _sum: { total: true, totalProfit: true, totalCommission: true },
          _count: { _all: true },
        }),
      ]);

      // Preserve the existing daily-summaries semantics: live replaces today's
      // stored row for that branch, never adds to it.
      const summaries = new Map(history.map((row) => [
        `${row.branchId}_${row.date}`,
        {
          id: row.id, date: row.date, branchId: row.branchId,
          revenue: Number(row.revenue), profit: Number(row.totalProfit),
          totalCommission: Number(row.totalCommission), count: row.salesCount,
        },
      ]));
      for (const row of live) {
        summaries.set(`${row.branchId}_${today}`, {
          id: `live_${row.branchId}_${today}`, date: today, branchId: row.branchId,
          revenue: Number(row._sum.total ?? 0),
          profit: Number(row._sum.totalProfit ?? 0),
          totalCommission: Number(row._sum.totalCommission ?? 0),
          count: row._count._all,
        });
      }
      res.json({
        summaries: [...summaries.values()].sort((a, b) => a.date.localeCompare(b.date)),
        updatedAt: new Date().toISOString(),
      });
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/owner-dashboard/details", authenticate, authorizeOwner, async (req, res, next) => {
    try {
      const branchId = readBranch(req.query.branchId);
      const branchWhere = branchId ? { branchId } : {};
      const [recentSales, ranked] = await Promise.all([
        prisma.sale.findMany({
          where: branchWhere,
          take: 10,
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
          include: {
            items: { include: { product: { select: { id: true, name: true, buyingPrice: true } } } },
            cashier: { select: { id: true, name: true } },
          },
        }),
        prisma.saleItem.groupBy({
          by: ["productId"],
          where: { sale: { ...branchWhere, status: { not: "refunded" } } },
          _sum: { qty: true },
          orderBy: { _sum: { qty: "desc" } },
          take: 5,
        }),
      ]);
      const names = await prisma.product.findMany({
        where: { id: { in: ranked.map((row) => row.productId) } },
        select: { id: true, name: true },
      });
      const byId = new Map(names.map((product) => [product.id, product.name]));
      // Keep the original shift-keeper labels without loading the full shift log.
      const shifts = recentSales.length ? await prisma.shift.findMany({
        where: {
          ...(branchId ? { branchId } : { branchId: { in: [...new Set(recentSales.map((sale) => sale.branchId))] } }),
          openTime: { lte: recentSales[0].createdAt },
          OR: [{ closeTime: null }, { closeTime: { gte: recentSales[recentSales.length - 1].createdAt } }],
        },
        select: { branchId: true, openTime: true, closeTime: true, shiftType: true, cashier: { select: { name: true } } },
        orderBy: { openTime: "desc" },
      }) : [];
      res.json({
        recentSales: recentSales.map((sale) => {
          const shift = shifts.find((row) => row.branchId === sale.branchId &&
            sale.createdAt >= row.openTime && (!row.closeTime || sale.createdAt <= row.closeTime));
          return {
            ...sale,
            cashierName: shift
              ? (shift.shiftType?.includes(" - ") ? shift.shiftType.split(" - ")[1] : shift.cashier.name)
              : sale.cashier.name,
          };
        }),
        topProducts: ranked.map((row) => ({
          name: byId.get(row.productId) ?? "Produk",
          qty: Number(row._sum.qty ?? 0),
        })),
      });
    } catch (error) {
      next(error);
    }
  });
}