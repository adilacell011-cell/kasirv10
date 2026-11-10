import { Prisma, type PrismaClient } from "@prisma/client";
import {
  DeactivateProductParams,
  DeactivateProductResponse,
  GetInactiveProductsResponse,
  ReactivateProductParams,
  ReactivateProductResponse,
} from "@workspace/api-zod";
import type { Application, RequestHandler } from "express";
import { logger } from "./lib/logger";

export type LockedProductStatus = { id: string; status: string };

export function isProductVisibleInBranch(
  visibleBranchIds: string | null | undefined,
  branchId: string,
) {
  const visibility = visibleBranchIds || "*";
  if (visibility === "*") return true;
  if (visibility === "__NONE__") return false;
  if (visibility.startsWith("!")) {
    return !visibility.slice(1).split(",").map((id) => id.trim()).includes(branchId);
  }
  return visibility.split(",").map((id) => id.trim()).includes(branchId);
}

export async function lockProductStatus(
  tx: Prisma.TransactionClient,
  productId: string,
): Promise<LockedProductStatus | null> {
  const rows = await tx.$queryRaw<LockedProductStatus[]>(Prisma.sql`
    SELECT "id", "status"
    FROM "Product"
    WHERE "id" = ${productId}
    FOR UPDATE
  `);
  return rows[0] ?? null;
}

type BranchStockRow = { branchId: string; branchName: string; qty: number };
type LifecycleResult =
  | { kind: "ok" }
  | { kind: "not-found" }
  | { kind: "conflict"; error: string; stocks: BranchStockRow[] };

export function findNonZeroBranchStocks<T extends { qty: number }>(stocks: T[]): T[] {
  return stocks.filter((stock) => stock.qty !== 0);
}

export class ProductLifecycleConflict extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProductLifecycleConflict";
  }
}

export function registerProductLifecycleRoutes(
  app: Application,
  prisma: PrismaClient,
  authenticateToken: RequestHandler,
  requireRole: (...roles: string[]) => RequestHandler,
  emitProductUpdated: (payload: { id: string }) => void,
) {
  const adminAccess = [authenticateToken, requireRole("ADMIN")];

  app.get("/api/products/inactive", ...adminAccess, async (_req, res): Promise<void> => {
    try {
      const products = await prisma.product.findMany({
        where: { status: "INACTIVE" },
        orderBy: [{ name: "asc" }, { id: "asc" }],
        select: {
          id: true,
          name: true,
          barcode: true,
          category: true,
          brand: true,
          visibleBranchIds: true,
          status: true,
          stocks: {
            select: {
              branchId: true,
              qty: true,
              branch: { select: { name: true } },
            },
          },
        },
      });
      const response = products.map((product) => ({
        id: product.id,
        name: product.name,
        barcode: product.barcode,
        category: product.category,
        brand: product.brand,
        visibleBranchIds: product.visibleBranchIds,
        status: product.status,
        stocks: product.stocks.map((stock) => ({
          branchId: stock.branchId,
          branchName: stock.branch.name,
          qty: stock.qty,
        })),
      }));
      res.json(GetInactiveProductsResponse.parse(response));
    } catch (error) {
      logger.error({ err: error }, "Failed to list inactive products");
      res.status(500).json({ error: "Gagal memuat daftar produk nonaktif." });
    }
  });

  app.post("/api/products/:id/deactivate", ...adminAccess, async (req, res): Promise<void> => {
    const parsedParams = DeactivateProductParams.safeParse(req.params);
    if (!parsedParams.success) {
      res.status(400).json({ error: parsedParams.error.message });
      return;
    }
    const productId = parsedParams.data.id;

    try {
      const result: LifecycleResult = await prisma.$transaction(async (tx) => {
        const product = await lockProductStatus(tx, productId);
        if (!product) return { kind: "not-found" };
        if (product.status !== "ACTIVE") {
          return {
            kind: "conflict",
            error: "Hanya produk aktif yang dapat dinonaktifkan.",
            stocks: [],
          };
        }

        const stocks = await tx.$queryRaw<BranchStockRow[]>(Prisma.sql`
          SELECT ps."branchId", b."name" AS "branchName", ps."qty"
          FROM "ProductStock" ps
          JOIN "Branch" b ON b."id" = ps."branchId"
          WHERE ps."productId" = ${productId}
          ORDER BY b."name" ASC, ps."branchId" ASC
          FOR UPDATE OF ps
        `);
        const remainingStocks = findNonZeroBranchStocks(stocks);
        if (remainingStocks.length > 0) {
          return {
            kind: "conflict",
            error: "Produk belum dapat dinonaktifkan karena stok masih tersisa.",
            stocks: remainingStocks,
          };
        }

        await tx.product.update({
          where: { id: productId },
          data: { status: "INACTIVE" },
          select: { id: true },
        });
        return { kind: "ok" };
      });

      if (result.kind === "not-found") {
        res.status(404).json({ error: "Produk tidak ditemukan." });
        return;
      }
      if (result.kind === "conflict") {
        res.status(409).json({ error: result.error, stocks: result.stocks });
        return;
      }

      emitProductUpdated({ id: productId });
      res.json(DeactivateProductResponse.parse({ success: true }));
    } catch (error) {
      logger.error({ err: error, productId }, "Failed to deactivate product");
      res.status(500).json({ error: "Gagal menonaktifkan produk." });
    }
  });

  app.post("/api/products/:id/reactivate", ...adminAccess, async (req, res): Promise<void> => {
    const parsedParams = ReactivateProductParams.safeParse(req.params);
    if (!parsedParams.success) {
      res.status(400).json({ error: parsedParams.error.message });
      return;
    }
    const productId = parsedParams.data.id;

    try {
      const result: LifecycleResult = await prisma.$transaction(async (tx) => {
        const product = await lockProductStatus(tx, productId);
        if (!product) return { kind: "not-found" };
        if (product.status !== "INACTIVE") {
          return {
            kind: "conflict",
            error: "Hanya produk nonaktif yang dapat diaktifkan kembali.",
            stocks: [],
          };
        }
        await tx.product.update({
          where: { id: productId },
          data: { status: "ACTIVE" },
          select: { id: true },
        });
        return { kind: "ok" };
      });

      if (result.kind === "not-found") {
        res.status(404).json({ error: "Produk tidak ditemukan." });
        return;
      }
      if (result.kind === "conflict") {
        res.status(409).json({ error: result.error });
        return;
      }

      emitProductUpdated({ id: productId });
      res.json(ReactivateProductResponse.parse({ success: true }));
    } catch (error) {
      logger.error({ err: error, productId }, "Failed to reactivate product");
      res.status(500).json({ error: "Gagal mengaktifkan kembali produk." });
    }
  });
}
