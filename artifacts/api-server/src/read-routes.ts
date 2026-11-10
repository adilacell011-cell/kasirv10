import type { Express, RequestHandler } from "express";
import type { PrismaClient } from "@prisma/client";
import { isProductVisibleInBranch } from "./product-lifecycle";

type Requester = {
  role?: string;
  branchId?: string | null;
};

function ownBranchId(requester: Requester): string {
  // An unassigned cashier must never turn an absent branch claim into an
  // unfiltered Prisma query.
  return typeof requester.branchId === "string" ? requester.branchId : "";
}

export function registerBranchReadRoutes(
  app: Express,
  prisma: PrismaClient,
  authenticate: RequestHandler,
  logicalDate: (date: Date) => string,
) {
  app.get("/api/products", authenticate, async (req, res) => {
    try {
      const requester = (req as any).user as Requester;
      // Harga modal hanya boleh dilihat oleh ADMIN dan AUDIT.
      const showCost = requester.role === "ADMIN" || requester.role === "AUDIT";
      const cashierBranchId = requester.role === "CASHIER"
        ? ownBranchId(requester)
        : undefined;
      const products = await prisma.product.findMany({
        where: { status: "ACTIVE" },
        include: {
          stocks: cashierBranchId === undefined
            ? true
            : { where: { branchId: cashierBranchId } },
        },
      });
      // Match the existing POS visibility rule, but enforce it before sending data.
      const visibleProducts = cashierBranchId === undefined
        ? products
        : products.filter((product) => {
          return Boolean(cashierBranchId) &&
            isProductVisibleInBranch(product.visibleBranchIds, cashierBranchId);
        });
      const formattedProducts = visibleProducts.map((product: any) => {
        const base: any = {
          ...product,
          sellingPrice: Number(product.sellingPrice),
          discountPrice: product.discountPrice ? Number(product.discountPrice) : 0,
          commissionAmount: Number(product.commissionAmount),
          stocks: product.stocks.reduce(
            (acc: any, stock: any) => ({ ...acc, [stock.branchId]: stock.qty }),
            {},
          ),
        };
        if (showCost) {
          base.buyingPrice = Number(product.buyingPrice);
          base.purchasePrice = Number(product.buyingPrice);
        } else {
          delete base.buyingPrice;
          delete base.purchasePrice;
        }
        if (cashierBranchId !== undefined && base.visibleBranchIds && base.visibleBranchIds !== "*") {
          base.visibleBranchIds = cashierBranchId;
        }
        return base;
      });
      res.json(formattedProducts);
    } catch (error) {
      console.error("Fetch Products Error:", error);
      res.status(500).json({
        error: "Failed to fetch products",
        details: (error as Error).message,
      });
    }
  });

  app.get("/api/branches", authenticate, async (req, res) => {
    try {
      const requester = (req as any).user as Requester;
      const branches = await prisma.branch.findMany({
        ...(requester.role === "CASHIER"
          ? { where: { id: ownBranchId(requester) } }
          : {}),
      });
      res.json(branches);
    } catch {
      res.status(500).json({ error: "Failed to fetch branches" });
    }
  });

  app.get("/api/branches/transfer-targets", authenticate, async (req, res) => {
    const requester = (req as any).user as Requester;
    if (requester.role !== "CASHIER") {
      res.status(403).json({ error: "Cashier access required." });
      return;
    }

    const branchId = ownBranchId(requester);
    if (!branchId) {
      res.json([]);
      return;
    }

    try {
      const targets = await prisma.branch.findMany({
        where: { id: { not: branchId } },
        select: { id: true, name: true },
        orderBy: { name: "asc" },
      });
      res.json(targets);
    } catch {
      res.status(500).json({ error: "Failed to fetch transfer destinations" });
    }
  });

  app.get("/api/users", authenticate, async (req, res) => {
    try {
      const requester = (req as any).user as Requester;
      const users = await prisma.user.findMany({
        ...(requester.role === "CASHIER"
          ? { where: { branchId: ownBranchId(requester) } }
          : {}),
        include: { branch: true },
      });
      const usersWithoutPasswords = users.map(({ password: _, ...user }: any) => user);
      res.json(usersWithoutPasswords);
    } catch {
      res.status(500).json({ error: "Failed to fetch users" });
    }
  });

  app.get("/api/daily-summaries", authenticate, async (req, res) => {
    try {
      const requester = (req as any).user as Requester;
      const branchFilter = requester.role === "CASHIER"
        ? { branchId: ownBranchId(requester) }
        : {};

      // Preserve the existing history/live merge and day-boundary semantics.
      const archivedSummaries = await prisma.dailyIncomeSummary.findMany({
        where: branchFilter,
        orderBy: { date: "asc" },
      });

      const today = logicalDate(new Date());
      const [year, month, day] = today.split("-").map(Number);
      const todayStart = new Date(Date.UTC(year, month - 1, day - 1, 23));
      const todayEnd = new Date(Date.UTC(year, month - 1, day, 23));
      const todaySales = await prisma.sale.groupBy({
        by: ["branchId"],
        where: {
          ...branchFilter,
          status: "success",
          createdAt: { gte: todayStart, lt: todayEnd },
        },
        _sum: { total: true, totalProfit: true, totalCommission: true },
        _count: { _all: true },
      });

      const todayLive = Object.fromEntries(todaySales.map((row) => [row.branchId, {
        date: today,
        branchId: row.branchId,
        revenue: Number(row._sum.total ?? 0),
        profit: Number(row._sum.totalProfit ?? 0),
        totalCommission: Number(row._sum.totalCommission ?? 0),
        count: row._count._all,
      }]));

      const merged: Record<string, any> = {};
      for (const summary of archivedSummaries as any[]) {
        merged[`${summary.branchId}_${summary.date}`] = {
          id: summary.id,
          date: summary.date,
          branchId: summary.branchId,
          revenue: Number(summary.revenue),
          profit: Number(summary.totalProfit),
          totalCommission: Number(summary.totalCommission),
          count: summary.salesCount,
        };
      }
      for (const [branchId, summary] of Object.entries(todayLive)) {
        merged[`${branchId}_${today}`] = {
          id: `live_${branchId}_${today}`,
          date: summary.date,
          branchId: summary.branchId,
          revenue: summary.revenue,
          profit: summary.profit,
          totalCommission: summary.totalCommission,
          count: summary.count,
        };
      }

      res.json(Object.values(merged).sort((a, b) => a.date.localeCompare(b.date)));
    } catch (error: any) {
      console.error("Get Daily Summaries Error:", error);
      res.status(500).json({
        error: "Gagal mengambil ringkasan harian: " + error.message,
      });
    }
  });
}
