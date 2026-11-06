import { Prisma, type PrismaClient } from "@prisma/client";
import {
  BeginStockAuditCountBody,
  BeginStockAuditCountResponse,
  CancelStockAuditBody,
  CancelStockAuditResponse,
  FinalizeStockAuditBody,
  FinalizeStockAuditResponse,
  GetStockAuditCurrentQueryParams,
  GetStockAuditCurrentResponse,
  GetStockAuditItemsQueryParams,
  GetStockAuditItemsResponse,
  ReportStockAuditExceptionBody,
  ReportStockAuditExceptionResponse,
  SaveStockAuditCountBody,
  SaveStockAuditCountResponse,
  SearchStockAuditCandidatesQueryParams,
  SearchStockAuditCandidatesResponse,
  StartStockAuditBody,
  StartStockAuditResponse,
} from "@workspace/api-zod";
import type { Application, Request, RequestHandler, Response } from "express";
import { logger } from "./lib/logger";
import { applyStockDelta, InsufficientAdjustmentStock } from "./stock-adjustment";

type AuthUser = { userId: string; role: string; branchId?: string | null };
type AuthenticatedRequest = Request & { user?: AuthUser };
type StockAuditStatus = "IN_PROGRESS" | "COMPLETED" | "CANCELLED";
type StockAuditItemStatus = "PENDING" | "COUNTING" | "COUNTED" | "RECOUNT_REQUIRED" | "EXCLUDED";
type Finding = "NORMAL" | "NOT_FOUND" | "EXPIRED" | "DAMAGED" | "NOT_SOLD_HERE" | "UNLISTED_IN_BRANCH";

function actorFrom(req: Request) {
  const user = (req as AuthenticatedRequest).user;
  return user?.userId ? { id: user.userId, role: user.role } : null;
}

function errorResponse(res: Response, status: number, message: string) {
  return res.status(status).json({ error: message });
}

function isPrismaCode(error: unknown, code: string) {
  return typeof error === "object" && error !== null && "code" in error &&
    (error as { code?: unknown }).code === code;
}

async function getActorName(prisma: PrismaClient, actorId: string) {
  const actor = await prisma.user.findUnique({
    where: { id: actorId },
    select: { name: true, username: true },
  });
  return actor?.name?.trim() || actor?.username || null;
}

async function getSummary(prisma: PrismaClient, auditId: string) {
  const [row] = await prisma.$queryRaw<Array<{
    totalProducts: number;
    counted: number;
    pending: number;
    counting: number;
    recountRequired: number;
    excluded: number;
    positiveVariance: number;
    negativeVariance: number;
    netVariance: number;
  }>>(Prisma.sql`
    SELECT
      COUNT(*) FILTER (WHERE "inScope")::int AS "totalProducts",
      COUNT(*) FILTER (WHERE "inScope" AND "status" = 'COUNTED')::int AS "counted",
      COUNT(*) FILTER (WHERE "inScope" AND "status" = 'PENDING')::int AS "pending",
      COUNT(*) FILTER (WHERE "inScope" AND "status" = 'COUNTING')::int AS "counting",
      COUNT(*) FILTER (WHERE "inScope" AND "status" = 'RECOUNT_REQUIRED')::int AS "recountRequired",
      COUNT(*) FILTER (WHERE NOT "inScope" OR "status" = 'EXCLUDED')::int AS "excluded",
      COALESCE(SUM("variance") FILTER (WHERE "inScope" AND "status" = 'COUNTED' AND "variance" > 0), 0)::int AS "positiveVariance",
      COALESCE(ABS(SUM("variance") FILTER (WHERE "inScope" AND "status" = 'COUNTED' AND "variance" < 0)), 0)::int AS "negativeVariance",
      COALESCE(SUM("variance") FILTER (WHERE "inScope" AND "status" = 'COUNTED'), 0)::int AS "netVariance"
    FROM "BranchStockAuditItem"
    WHERE "auditId" = ${auditId}
  `);
  return row ?? {
    totalProducts: 0, counted: 0, pending: 0, counting: 0, recountRequired: 0,
    excluded: 0, positiveVariance: 0, negativeVariance: 0, netVariance: 0,
  };
}

async function sessionDto(prisma: PrismaClient, audit: {
  id: string;
  branchId: string;
  branchNameSnapshot: string;
  status: string;
  startedAt: Date;
  startedByName: string;
  completedAt: Date | null;
  completedByName: string | null;
  cancelledAt: Date | null;
  cancelledByName: string | null;
}) {
  return {
    id: audit.id,
    branchId: audit.branchId,
    branchName: audit.branchNameSnapshot,
    status: audit.status as StockAuditStatus,
    startedAt: audit.startedAt,
    startedByName: audit.startedByName,
    completedAt: audit.completedAt,
    completedByName: audit.completedByName,
    cancelledAt: audit.cancelledAt,
    cancelledByName: audit.cancelledByName,
    summary: await getSummary(prisma, audit.id),
  };
}

async function lockAudit(tx: Prisma.TransactionClient, auditId: string) {
  const rows = await tx.$queryRaw<Array<{ id: string; branchId: string; status: string }>>(Prisma.sql`
    SELECT "id", "branchId", "status"
    FROM "BranchStockAudit"
    WHERE "id" = ${auditId}
    FOR UPDATE
  `);
  return rows[0] ?? null;
}

async function lockProductStock(
  tx: Prisma.TransactionClient,
  productId: string,
  branchId: string,
): Promise<number | null> {
  const products = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
    SELECT "id" FROM "Product" WHERE "id" = ${productId} FOR UPDATE
  `);
  if (!products.length) return null;
  const stocks = await tx.$queryRaw<Array<{ qty: number }>>(Prisma.sql`
    SELECT "qty" FROM "ProductStock"
    WHERE "productId" = ${productId} AND "branchId" = ${branchId}
    FOR UPDATE
  `);
  return stocks[0]?.qty ?? 0;
}

function productIsVisible(visibleBranchIds: string, branchId: string) {
  return visibleBranchIds === "*" ||
    visibleBranchIds.split(",").map((id) => id.trim()).includes(branchId);
}

function itemDto(item: {
  id: string;
  productId: string;
  productNameSnapshot: string;
  barcodeSnapshot: string | null;
  masterSNSnapshot: string | null;
  status: string;
  inScope: boolean;
  countStartedAt: Date | null;
  expectedQty: number;
  baselineQty: number | null;
  countedQty: number | null;
  variance: number | null;
  finding: string | null;
  notes: string | null;
  countedByName: string | null;
  countedAt: Date | null;
}, systemQty: number) {
  return {
    id: item.id,
    productId: item.productId,
    productName: item.productNameSnapshot,
    barcode: item.barcodeSnapshot,
    masterSN: item.masterSNSnapshot,
    status: item.status as StockAuditItemStatus,
    inScope: item.inScope,
    expectedQty: item.expectedQty,
    systemQty,
    ...(item.status === "COUNTING" && item.countStartedAt
      ? { countToken: item.countStartedAt.toISOString() }
      : {}),
    baselineQty: item.baselineQty,
    countedQty: item.countedQty,
    variance: item.variance,
    finding: item.finding as Finding | null,
    notes: item.notes,
    countedByName: item.countedByName,
    countedAt: item.countedAt,
  };
}

export function registerStockAuditRoutes(
  app: Application,
  prisma: PrismaClient,
  authenticateToken: RequestHandler,
  requireRole: (...roles: string[]) => RequestHandler,
  emitBranch: (branchId: string | null | undefined, event: string, payload: unknown) => void,
) {
  const auditAccess = [authenticateToken, requireRole("ADMIN", "AUDIT")];

  app.get("/api/stock-audits/current", ...auditAccess, async (req, res): Promise<void> => {
    const parsedQuery = GetStockAuditCurrentQueryParams.safeParse(req.query);
    if (!parsedQuery.success) return void errorResponse(res, 400, parsedQuery.error.message);
    const branchId = parsedQuery.data.branchId.trim();
    if (!branchId) return void errorResponse(res, 400, "Cabang wajib dipilih.");
    try {
      const branch = await prisma.branch.findUnique({ where: { id: branchId }, select: { id: true } });
      if (!branch) return void errorResponse(res, 404, "Cabang tidak ditemukan.");
      const audit = await prisma.branchStockAudit.findFirst({
        where: { activeBranchId: branchId },
        select: {
          id: true, branchId: true, branchNameSnapshot: true, status: true, startedAt: true,
          startedByName: true, completedAt: true, completedByName: true, cancelledAt: true, cancelledByName: true,
        },
      }) ?? await prisma.branchStockAudit.findFirst({
        where: { branchId },
        orderBy: { startedAt: "desc" },
        select: {
          id: true, branchId: true, branchNameSnapshot: true, status: true, startedAt: true,
          startedByName: true, completedAt: true, completedByName: true, cancelledAt: true, cancelledByName: true,
        },
      });
      const payload = audit ? await sessionDto(prisma, audit) : null;
      return void res.json(GetStockAuditCurrentResponse.parse(payload));
    } catch (error) {
      logger.error({ err: error }, "Failed to read branch stock audit");
      return void errorResponse(res, 500, "Gagal memuat sesi audit stok.");
    }
  });

  app.get("/api/stock-audits/items", ...auditAccess, async (req, res): Promise<void> => {
    const parsedQuery = GetStockAuditItemsQueryParams.safeParse(req.query);
    if (!parsedQuery.success) return void errorResponse(res, 400, parsedQuery.error.message);
    const { auditId, page, pageSize } = parsedQuery.data;
    const status = parsedQuery.data.status ?? "";
    const search = parsedQuery.data.search?.trim() ?? "";
    try {
      const audit = await prisma.branchStockAudit.findUnique({
        where: { id: auditId },
        select: { id: true, branchId: true, status: true },
      });
      if (!audit) return void errorResponse(res, 404, "Sesi audit tidak ditemukan.");
      const where: Prisma.BranchStockAuditItemWhereInput = {
        auditId: audit.id,
        ...(status ? { status } : {}),
        ...(search ? {
          OR: [
            { productNameSnapshot: { contains: search, mode: "insensitive" } },
            { barcodeSnapshot: { contains: search, mode: "insensitive" } },
            { masterSNSnapshot: { contains: search, mode: "insensitive" } },
          ],
        } : {}),
      };
      const [items, total] = await Promise.all([
        prisma.branchStockAuditItem.findMany({
          where,
          orderBy: [{ inScope: "desc" }, { productNameSnapshot: "asc" }, { id: "asc" }],
          skip: (page - 1) * pageSize,
          take: pageSize,
        }),
        prisma.branchStockAuditItem.count({ where }),
      ]);
      const currentStocks = audit.status === "IN_PROGRESS" && items.length
        ? await prisma.productStock.findMany({
            where: { branchId: audit.branchId, productId: { in: items.map((item) => item.productId) } },
            select: { productId: true, qty: true },
          })
        : [];
      const currentQtyByProduct = new Map(currentStocks.map((stock) => [stock.productId, stock.qty]));
      const responseItems = items.map((item) => itemDto(
        item,
        audit.status === "IN_PROGRESS"
          ? currentQtyByProduct.get(item.productId) ?? 0
          : item.baselineQty ?? item.expectedQty,
      ));
      return void res.json(GetStockAuditItemsResponse.parse({ items: responseItems, page, pageSize, total }));
    } catch (error) {
      logger.error({ err: error }, "Failed to read branch stock audit items");
      return void errorResponse(res, 500, "Gagal memuat daftar produk audit.");
    }
  });

  app.get("/api/stock-audits/candidates", ...auditAccess, async (req, res): Promise<void> => {
    const parsedQuery = SearchStockAuditCandidatesQueryParams.safeParse(req.query);
    if (!parsedQuery.success) return void errorResponse(res, 400, parsedQuery.error.message);
    const { auditId, search } = parsedQuery.data;
    try {
      const audit = await prisma.branchStockAudit.findUnique({
        where: { id: auditId },
        select: { id: true, branchId: true, status: true },
      });
      if (!audit) return void errorResponse(res, 404, "Sesi audit tidak ditemukan.");
      if (audit.status !== "IN_PROGRESS") return void errorResponse(res, 409, "Sesi audit sudah ditutup.");
      const likeSearch = `%${search}%`;
      const products = await prisma.$queryRaw<Array<{
        id: string;
        name: string;
        barcode: string | null;
        masterSN: string | null;
        branchStockQty: number;
      }>>(Prisma.sql`
        SELECT p."id", p."name", p."barcode", p."masterSN",
          COALESCE(ps."qty", 0)::int AS "branchStockQty"
        FROM "Product" p
        LEFT JOIN "ProductStock" ps
          ON ps."productId" = p."id" AND ps."branchId" = ${audit.branchId}
        WHERE (
          p."name" ILIKE ${likeSearch} OR p."barcode" ILIKE ${likeSearch} OR p."masterSN" ILIKE ${likeSearch}
        )
        AND NOT EXISTS (
          SELECT 1 FROM "BranchStockAuditItem" ai
          WHERE ai."auditId" = ${audit.id} AND ai."productId" = p."id"
        )
        ORDER BY p."name" ASC
        LIMIT 20
      `);
      return void res.json(SearchStockAuditCandidatesResponse.parse({
        items: products,
      }));
    } catch (error) {
      logger.error({ err: error }, "Failed to search branch audit candidates");
      return void errorResponse(res, 500, "Gagal mencari produk pengecualian.");
    }
  });

  app.post("/api/stock-audits", ...auditAccess, async (req, res): Promise<void> => {
    const actor = actorFrom(req);
    if (!actor) return void errorResponse(res, 401, "Sesi pengguna tidak valid.");
    const parsedBody = StartStockAuditBody.safeParse(req.body);
    if (!parsedBody.success) return void errorResponse(res, 400, parsedBody.error.message);
    const branchId = parsedBody.data.branchId.trim();
    if (!branchId) return void errorResponse(res, 400, "Cabang wajib dipilih.");
    const actorName = await getActorName(prisma, actor.id);
    if (!actorName) return void errorResponse(res, 401, "Akun pengguna tidak lagi tersedia.");
    try {
      const created = await prisma.$transaction(async (tx) => {
        const branch = await tx.branch.findUnique({ where: { id: branchId }, select: { id: true, name: true } });
        if (!branch) throw Object.assign(new Error("Cabang tidak ditemukan."), { statusCode: 404 });
        const audit = await tx.branchStockAudit.create({
          data: {
            branchId,
            branchNameSnapshot: branch.name,
            activeBranchId: branchId,
            status: "IN_PROGRESS",
            startedById: actor.id,
            startedByName: actorName,
          },
          select: { id: true },
        });
        let cursorId: string | undefined;
        let productsAdded = 0;
        while (true) {
          const products = await tx.product.findMany({
            where: {
              OR: [
                { status: "ACTIVE" },
                { stocks: { some: { branchId, qty: { not: 0 } } } },
              ],
            },
            select: {
              id: true, name: true, barcode: true, masterSN: true, status: true, visibleBranchIds: true,
              stocks: { where: { branchId }, select: { qty: true } },
            },
            orderBy: { id: "asc" },
            take: 500,
            ...(cursorId ? { cursor: { id: cursorId }, skip: 1 } : {}),
          });
          if (!products.length) break;
          const data = products.flatMap((product) => {
            const qty = product.stocks[0]?.qty ?? 0;
            const inScope = (product.status === "ACTIVE" && productIsVisible(product.visibleBranchIds, branchId)) || qty !== 0;
            return inScope ? [{
              auditId: audit.id,
              productId: product.id,
              productNameSnapshot: product.name,
              barcodeSnapshot: product.barcode,
              masterSNSnapshot: product.masterSN,
              inScope: true,
              expectedQty: qty,
              status: "PENDING",
            }] : [];
          });
          if (data.length) {
            await tx.branchStockAuditItem.createMany({ data, skipDuplicates: true });
            productsAdded += data.length;
          }
          cursorId = products[products.length - 1]!.id;
        }
        return { id: audit.id, productsAdded };
      }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
      const audit = await prisma.branchStockAudit.findUniqueOrThrow({
        where: { id: created.id },
        select: {
          id: true, branchId: true, branchNameSnapshot: true, status: true, startedAt: true,
          startedByName: true, completedAt: true, completedByName: true, cancelledAt: true, cancelledByName: true,
        },
      });
      return void res.status(201).json(StartStockAuditResponse.parse(await sessionDto(prisma, audit)));
    } catch (error) {
      const statusCode = typeof error === "object" && error !== null && "statusCode" in error
        ? Number((error as { statusCode: unknown }).statusCode) : 0;
      if (statusCode === 404) return void errorResponse(res, 404, "Cabang tidak ditemukan.");
      if (isPrismaCode(error, "P2002")) return void errorResponse(res, 409, "Cabang sudah memiliki sesi audit yang berjalan.");
      logger.error({ err: error }, "Failed to start branch stock audit");
      return void errorResponse(res, 500, "Gagal memulai sesi audit stok.");
    }
  });

  app.post("/api/stock-audits/begin-count", ...auditAccess, async (req, res): Promise<void> => {
    const actor = actorFrom(req);
    if (!actor) return void errorResponse(res, 401, "Sesi pengguna tidak valid.");
    const parsedBody = BeginStockAuditCountBody.safeParse(req.body);
    if (!parsedBody.success) return void errorResponse(res, 400, parsedBody.error.message);
    const { auditId, itemId } = parsedBody.data;
    const actorName = await getActorName(prisma, actor.id);
    if (!actorName) return void errorResponse(res, 401, "Akun pengguna tidak lagi tersedia.");
    try {
      const result = await prisma.$transaction(async (tx) => {
        const audit = await lockAudit(tx, auditId);
        if (!audit) return { status: 404 as const };
        if (audit.status !== "IN_PROGRESS") return { status: 409 as const, error: "Sesi audit sudah ditutup." };
        const items = await tx.$queryRaw<Array<{
          id: string; productId: string; inScope: boolean; status: string; countStartedAt: Date | null;
        }>>(Prisma.sql`
          SELECT "id", "productId", "inScope", "status", "countStartedAt"
          FROM "BranchStockAuditItem"
          WHERE "id" = ${itemId} AND "auditId" = ${auditId}
          FOR UPDATE
        `);
        const item = items[0];
        if (!item) return { status: 404 as const };
        if (!item.inScope || item.status === "EXCLUDED") return { status: 400 as const, error: "Produk di luar cakupan tidak dapat dihitung sebagai stok cabang." };
        const baselineQty = await lockProductStock(tx, item.productId, audit.branchId);
        if (baselineQty === null) return { status: 409 as const, error: "Produk sudah tidak tersedia. Sesi audit tidak diubah." };
        // The row is locked, so advance the version even when two requests land
        // within the same millisecond. This keeps an earlier counter's token stale.
        const countStartedAt = new Date(Math.max(
          Date.now(),
          (item.countStartedAt?.getTime() ?? 0) + 1,
        ));
        await tx.branchStockAuditItem.update({
          where: { id: item.id },
          data: {
            status: "COUNTING",
            baselineQty,
            countStartedById: actor.id,
            countStartedByName: actorName,
            countStartedAt,
          },
        });
        return { status: 200 as const, baselineQty, countToken: countStartedAt.toISOString() };
      });
      if (result.status !== 200) return void errorResponse(res, result.status, ("error" in result ? result.error : undefined) ?? "Item audit tidak ditemukan.");
      return void res.json(BeginStockAuditCountResponse.parse({ baselineQty: result.baselineQty, countToken: result.countToken }));
    } catch (error) {
      logger.error({ err: error }, "Failed to begin branch stock count");
      return void errorResponse(res, 500, "Gagal memulai hitungan produk.");
    }
  });

  app.patch("/api/stock-audits/count", ...auditAccess, async (req, res): Promise<void> => {
    const actor = actorFrom(req);
    if (!actor) return void errorResponse(res, 401, "Sesi pengguna tidak valid.");
    const parsedBody = SaveStockAuditCountBody.safeParse(req.body);
    if (!parsedBody.success) return void errorResponse(res, 400, parsedBody.error.message);
    const { auditId, itemId, countedQty, finding, countToken } = parsedBody.data;
    const notes = parsedBody.data.notes?.trim() || null;
    if (finding === "NOT_FOUND" && countedQty !== 0) return void errorResponse(res, 400, "Temuan Tidak ditemukan harus memiliki jumlah fisik 0.");
    const actorName = await getActorName(prisma, actor.id);
    if (!actorName) return void errorResponse(res, 401, "Akun pengguna tidak lagi tersedia.");
    try {
      const result = await prisma.$transaction(async (tx) => {
        const audit = await lockAudit(tx, auditId);
        if (!audit) return { status: 404 as const };
        if (audit.status !== "IN_PROGRESS") return { status: 409 as const, error: "Sesi audit sudah ditutup." };
        const rows = await tx.$queryRaw<Array<{
          id: string; productId: string; inScope: boolean; status: string;
          baselineQty: number | null; countStartedAt: Date | null;
        }>>(Prisma.sql`
          SELECT "id", "productId", "inScope", "status", "baselineQty", "countStartedAt"
          FROM "BranchStockAuditItem"
          WHERE "id" = ${itemId} AND "auditId" = ${auditId}
          FOR UPDATE
        `);
        const item = rows[0];
        if (!item) return { status: 404 as const };
        if (!item.inScope || item.status !== "COUNTING" || item.baselineQty === null ||
            !item.countStartedAt || item.countStartedAt.getTime() !== countToken.getTime()) {
          return { status: 409 as const, error: "Hitungan ini sudah berubah atau dimulai ulang oleh petugas lain. Segarkan daftar dan mulai hitung lagi." };
        }
        const currentQty = await lockProductStock(tx, item.productId, audit.branchId);
        if (currentQty === null) return { status: 409 as const, error: "Produk sudah tidak tersedia. Stok tidak diubah." };
        if (currentQty !== item.baselineQty) {
          await tx.branchStockAuditItem.update({
            where: { id: item.id },
            data: {
              status: "RECOUNT_REQUIRED",
              countedQty,
              variance: null,
              finding,
              notes,
              countedById: actor.id,
              countedByName: actorName,
              countedAt: new Date(),
            },
          });
          return { status: 409 as const, error: "Stok bergerak saat produk dihitung. Hitungan disimpan sebagai konflik; mulai hitung ulang dengan stok sistem terbaru." };
        }
        const countedAt = new Date();
        await tx.branchStockAuditItem.update({
          where: { id: item.id },
          data: {
            status: "COUNTED",
            countedQty,
            variance: countedQty - item.baselineQty,
            finding,
            notes,
            countedById: actor.id,
            countedByName: actorName,
            countedAt,
          },
        });
        return { status: 200 as const };
      });
      if (result.status !== 200) return void errorResponse(res, result.status, ("error" in result ? result.error : undefined) ?? "Item audit tidak ditemukan.");
      return void res.json(SaveStockAuditCountResponse.parse({ success: true }));
    } catch (error) {
      logger.error({ err: error }, "Failed to save branch stock count");
      return void errorResponse(res, 500, "Gagal menyimpan hitungan stok.");
    }
  });

  app.post("/api/stock-audits/exceptions", ...auditAccess, async (req, res): Promise<void> => {
    const actor = actorFrom(req);
    if (!actor) return void errorResponse(res, 401, "Sesi pengguna tidak valid.");
    const parsedBody = ReportStockAuditExceptionBody.safeParse(req.body);
    if (!parsedBody.success) return void errorResponse(res, 400, parsedBody.error.message);
    const { auditId, productId, finding } = parsedBody.data;
    const notes = parsedBody.data.notes?.trim() || null;
    const countedQty = parsedBody.data.countedQty ?? null;
    const actorName = await getActorName(prisma, actor.id);
    if (!actorName) return void errorResponse(res, 401, "Akun pengguna tidak lagi tersedia.");
    try {
      const result = await prisma.$transaction(async (tx) => {
        const audit = await lockAudit(tx, auditId);
        if (!audit) return { status: 404 as const };
        if (audit.status !== "IN_PROGRESS") return { status: 409 as const, error: "Sesi audit sudah ditutup." };
        const product = await tx.product.findUnique({
          where: { id: productId },
          select: { id: true, name: true, barcode: true, masterSN: true, stocks: { where: { branchId: audit.branchId }, select: { qty: true } } },
        });
        if (!product) return { status: 404 as const, error: "Produk katalog tidak ditemukan." };
        const existing = await tx.branchStockAuditItem.findUnique({
          where: { auditId_productId: { auditId, productId } },
          select: { id: true, inScope: true },
        });
        if (existing) {
          return { status: 409 as const, error: existing.inScope
            ? "Produk sudah termasuk cakupan audit. Gunakan hitungan produk."
            : "Pengecualian produk ini sudah tercatat pada sesi audit." };
        }
        const item = await tx.branchStockAuditItem.create({
          data: {
            auditId,
            productId: product.id,
            productNameSnapshot: product.name,
            barcodeSnapshot: product.barcode,
            masterSNSnapshot: product.masterSN,
            inScope: false,
            expectedQty: product.stocks[0]?.qty ?? 0,
            countedQty,
            status: "EXCLUDED",
            finding,
            notes,
            countedById: actor.id,
            countedByName: actorName,
            countedAt: new Date(),
          },
        });
        return { status: 201 as const, item: itemDto(item, product.stocks[0]?.qty ?? 0) };
      });
      if (result.status !== 201) return void errorResponse(res, result.status, ("error" in result ? result.error : undefined) ?? "Sesi audit tidak ditemukan.");
      return void res.status(201).json(ReportStockAuditExceptionResponse.parse({ success: true, item: result.item }));
    } catch (error) {
      if (isPrismaCode(error, "P2002")) return void errorResponse(res, 409, "Pengecualian produk sudah dicatat.");
      logger.error({ err: error }, "Failed to record branch audit exception");
      return void errorResponse(res, 500, "Gagal menyimpan pengecualian audit.");
    }
  });

  app.post("/api/stock-audits/finalize", ...auditAccess, async (req, res): Promise<void> => {
    const actor = actorFrom(req);
    if (!actor) return void errorResponse(res, 401, "Sesi pengguna tidak valid.");
    const parsedBody = FinalizeStockAuditBody.safeParse(req.body);
    if (!parsedBody.success) return void errorResponse(res, 400, parsedBody.error.message);
    const { auditId } = parsedBody.data;
    const actorName = await getActorName(prisma, actor.id);
    if (!actorName) return void errorResponse(res, 401, "Akun pengguna tidak lagi tersedia.");
    try {
      const result = await prisma.$transaction(async (tx) => {
        const audit = await lockAudit(tx, auditId);
        if (!audit) return { status: 404 as const };
        if (audit.status !== "IN_PROGRESS") return { status: 409 as const, error: "Sesi audit sudah ditutup." };
        const unfinished = await tx.branchStockAuditItem.count({
          where: { auditId: audit.id, inScope: true, status: { not: "COUNTED" } },
        });
        if (unfinished > 0) return { status: 409 as const, error: "Finalisasi ditolak. Selesaikan seluruh hitungan dan konflik terlebih dahulu." };
        const items = await tx.branchStockAuditItem.findMany({
          where: { auditId: audit.id, inScope: true, status: "COUNTED" },
          orderBy: { productId: "asc" },
        });
        const conflicts: Array<{ itemId: string; productName: string; reason: string }> = [];
        const currentQtyByProduct = new Map<string, number>();
        for (const item of items) {
          if (item.baselineQty === null || item.baselineQty < 0 || item.variance === null || item.countedQty === null ||
              item.variance !== item.countedQty - item.baselineQty) {
            conflicts.push({ itemId: item.id, productName: item.productNameSnapshot, reason: "Data hitungan tidak lengkap." });
            continue;
          }
          const currentQty = await lockProductStock(tx, item.productId, audit.branchId);
          if (currentQty === null) {
            conflicts.push({ itemId: item.id, productName: item.productNameSnapshot, reason: "Produk sudah tidak tersedia." });
          } else if (currentQty + item.variance < 0) {
            conflicts.push({ itemId: item.id, productName: item.productNameSnapshot, reason: "Stok saat ini tidak cukup untuk menerapkan selisih." });
          } else {
            currentQtyByProduct.set(item.productId, currentQty);
          }
        }
        if (conflicts.length) {
          await tx.branchStockAuditItem.updateMany({
            where: { id: { in: conflicts.map((item) => item.itemId) } },
            data: { status: "RECOUNT_REQUIRED", variance: null },
          });
          return {
            status: 409 as const,
            error: "Rekonsiliasi dihentikan tanpa perubahan stok. Item yang disebutkan perlu diperiksa atau dihitung ulang.",
            conflicts,
          };
        }
        const changedStocks: Array<{ productId: string; qty: number }> = [];
        for (const item of items) {
          const delta = item.variance!;
          if (delta !== 0) {
            await applyStockDelta(tx, item.productId, audit.branchId, delta);
            await tx.adjustment.create({
              data: {
                productId: item.productId,
                branchId: audit.branchId,
                qty: Math.abs(delta),
                type: delta > 0 ? "STOCK_IN" : "STOCK_OUT",
                reason: `Audit Stok Cabang ${audit.branchId} (${audit.id})`,
              },
            });
            changedStocks.push({ productId: item.productId, qty: currentQtyByProduct.get(item.productId)! + delta });
          }
          await tx.branchStockAuditItem.update({
            where: { id: item.id },
            data: { appliedAt: new Date() },
          });
        }
        await tx.branchStockAudit.update({
          where: { id: audit.id },
          data: {
            status: "COMPLETED",
            activeBranchId: null,
            completedById: actor.id,
            completedByName: actorName,
            completedAt: new Date(),
          },
        });
        return { status: 200 as const, changedStocks, branchId: audit.branchId };
      });
      if (result.status !== 200) {
        return void res.status(result.status).json({
          error: "error" in result ? result.error : "Sesi audit tidak ditemukan.",
          conflicts: "conflicts" in result ? result.conflicts : undefined,
        });
      }
      for (const stock of result.changedStocks) {
        emitBranch(result.branchId, "stockUpdated", {
          productId: stock.productId,
          branchId: result.branchId,
          qty: stock.qty,
        });
      }
      return void res.json(FinalizeStockAuditResponse.parse({ success: true, changedProducts: result.changedStocks.length }));
    } catch (error) {
      if (error instanceof InsufficientAdjustmentStock) {
        return void errorResponse(res, 409, "Stok tidak mencukupi. Tidak ada perubahan audit yang diterapkan; segarkan lalu hitung ulang.");
      }
      logger.error({ err: error }, "Failed to finalize branch stock audit");
      return void errorResponse(res, 500, "Gagal memfinalisasi audit stok. Tidak ada perubahan parsial yang disimpan.");
    }
  });

  app.post("/api/stock-audits/cancel", ...auditAccess, async (req, res): Promise<void> => {
    const actor = actorFrom(req);
    if (!actor) return void errorResponse(res, 401, "Sesi pengguna tidak valid.");
    const parsedBody = CancelStockAuditBody.safeParse(req.body);
    if (!parsedBody.success) return void errorResponse(res, 400, parsedBody.error.message);
    const { auditId } = parsedBody.data;
    const actorName = await getActorName(prisma, actor.id);
    if (!actorName) return void errorResponse(res, 401, "Akun pengguna tidak lagi tersedia.");
    try {
      const result = await prisma.$transaction(async (tx) => {
        const audit = await lockAudit(tx, auditId);
        if (!audit) return { status: 404 as const };
        if (audit.status !== "IN_PROGRESS") return { status: 409 as const, error: "Sesi audit sudah ditutup." };
        await tx.branchStockAudit.update({
          where: { id: audit.id },
          data: {
            status: "CANCELLED",
            activeBranchId: null,
            cancelledById: actor.id,
            cancelledByName: actorName,
            cancelledAt: new Date(),
          },
        });
        return { status: 200 as const };
      });
      if (result.status !== 200) return void errorResponse(res, result.status, ("error" in result ? result.error : undefined) ?? "Sesi audit tidak ditemukan.");
      return void res.json(CancelStockAuditResponse.parse({ success: true }));
    } catch (error) {
      logger.error({ err: error }, "Failed to cancel branch stock audit");
      return void errorResponse(res, 500, "Gagal membatalkan sesi audit.");
    }
  });
}
