import type { Express, RequestHandler } from "express";
import type { PrismaClient } from "@prisma/client";

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
      const formattedProducts = products.map((product: any) => {
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
      const todaySales = await prisma.sale.findMany({
        where: {
          ...branchFilter,
          status: "success",
          createdAt: { gte: todayStart, lt: todayEnd },
        },
      });

      const todayLive: Record<string, {
        date: string;
        branchId: string;
        revenue: number;
        profit: number;
        totalCommission: number;
        count: number;
      }> = {};
      for (const sale of todaySales as any[]) {
        const key = sale.branchId;
        if (!todayLive[key]) {
          todayLive[key] = {
            date: today,
            branchId: sale.branchId,
            revenue: 0,
            profit: 0,
            totalCommission: 0,
            count: 0,
          };
        }
        todayLive[key].revenue += Number(sale.total);
        todayLive[key].profit += Number(sale.totalProfit);
        todayLive[key].totalCommission += Number(sale.totalCommission);
        todayLive[key].count += 1;
      }

      const merged = new Map<string, any>();
      for (const summary of archivedSummaries as any[]) {
        merged.set(`${summary.branchId}_${summary.date}`, {
          id: summary.id,
          date: summary.date,
          branchId: summary.branchId,
          revenue: Number(summary.revenue),
          profit: Number(summary.totalProfit),
          totalCommission: Number(summary.totalCommission),
          count: summary.salesCount,
        });
      }
      for (const [branchId, summary] of Object.entries(todayLive)) {
        merged.set(`${branchId}_${today}`, {
          id: `live_${branchId}_${today}`,
          date: summary.date,
          branchId: summary.branchId,
          revenue: summary.revenue,
          profit: summary.profit,
          totalCommission: summary.totalCommission,
          count: summary.count,
        });
      }

      res.json([...merged.values()].sort((a, b) => a.date.localeCompare(b.date)));
    } catch (error: any) {
      console.error("Get Daily Summaries Error:", error);
      res.status(500).json({
        error: "Gagal mengambil ringkasan harian: " + error.message,
      });
    }
  });
}
