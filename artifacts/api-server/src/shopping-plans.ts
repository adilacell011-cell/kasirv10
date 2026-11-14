import type { Express } from "express";
import { Prisma, PrismaClient } from "@prisma/client";
import {
  ConfirmShoppingPlanReceiptBody,
  ConfirmShoppingPlanReceiptResponse,
  CreateShoppingPlanBody,
  CreateShoppingPlanResponse,
  GetCashierShoppingPlanReceiptsResponse,
  GetShoppingPlanRevisionsResponse,
  GetShoppingPlansResponse,
  ReviseShoppingPlanBody,
  ReviseShoppingPlanResponse,
} from "@workspace/api-zod";
import { logger } from "./lib/logger";
import { isProductVisibleInBranch } from "./product-lifecycle";
import { applyStockDelta } from "./stock-adjustment";

type AuthUser = {
  userId: string;
  role: string;
  branchId?: string | null;
  name?: string | null;
  username?: string | null;
};

type ReceiptItem = {
  productId: string;
  productNameSnapshot: string;
  productBarcodeSnapshot: string | null;
  plannedQty: number;
  actualQty: number | null;
  notAvailable: boolean;
  exceptionType?: "SHORTAGE" | "NOT_AVAILABLE" | "EXTRA";
  differenceQty?: number;
  note?: string;
};

type NormalizedPlanItem = {
  productId: string;
  productNameSnapshot: string;
  productBarcodeSnapshot: string | null;
  branchQtys: Record<string, number>;
};

class ShoppingPlanError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

function fail(status: number, message: string): never {
  throw new ShoppingPlanError(status, message);
}

function normalizePlanItemInputs(input: unknown): Array<{ productId: string; branchQtys: Record<string, number> }> {
  if (!Array.isArray(input)) fail(400, "Daftar produk rencana belanja tidak valid.");

  const seenProducts = new Set<string>();
  const result: Array<{ productId: string; branchQtys: Record<string, number> }> = [];

  for (const rawItem of input) {
    if (!rawItem || typeof rawItem !== "object" || Array.isArray(rawItem)) {
      fail(400, "Baris produk rencana belanja tidak valid.");
    }
    const productId = typeof rawItem.productId === "string" ? rawItem.productId.trim() : "";
    if (!productId || seenProducts.has(productId)) {
      fail(400, "Produk kosong atau tercatat lebih dari satu kali.");
    }
    seenProducts.add(productId);

    const inputBranchQtys = rawItem.branchQtys;
    if (!inputBranchQtys || typeof inputBranchQtys !== "object" || Array.isArray(inputBranchQtys)) {
      fail(400, "Jumlah produk per cabang tidak valid.");
    }
    const branchQtys: Record<string, number> = {};
    for (const [rawBranchId, rawQty] of Object.entries(inputBranchQtys)) {
      const branchId = rawBranchId.trim();
      if (!branchId) fail(400, "Cabang tidak valid.");
      if (rawQty === "" || rawQty === null || rawQty === undefined) continue;
      const qty = typeof rawQty === "number" ? rawQty : Number(rawQty);
      if (!Number.isSafeInteger(qty) || qty < 1) {
        fail(400, "Jumlah belanja harus minimal 1 pcs. Kosongkan jika tidak dibeli di cabang ini.");
      }
      branchQtys[branchId] = qty;
    }
    if (Object.keys(branchQtys).length > 0) result.push({ productId, branchQtys });
  }

  if (result.length === 0) fail(400, "Masukkan jumlah belanja untuk sedikitnya satu cabang.");
  return result;
}

async function validateAndSnapshotItems(
  tx: Prisma.TransactionClient,
  input: unknown,
): Promise<{ items: NormalizedPlanItem[]; branchNames: Map<string, string> }> {
  const normalized = normalizePlanItemInputs(input);
  const productIds = normalized.map((item) => item.productId);
  const branchIds = [...new Set(normalized.flatMap((item) => Object.keys(item.branchQtys)))];
  const [products, branches] = await Promise.all([
    tx.product.findMany({
      where: { id: { in: productIds } },
      select: { id: true, name: true, barcode: true, status: true, visibleBranchIds: true },
    }),
    tx.branch.findMany({
      where: { id: { in: branchIds } },
      select: { id: true, name: true },
    }),
  ]);
  const productById = new Map(products.map((product) => [product.id, product]));
  const branchNames = new Map(branches.map((branch) => [branch.id, branch.name]));

  if (productById.size !== productIds.length) fail(400, "Satu atau beberapa produk tidak ditemukan.");
  if (branchNames.size !== branchIds.length) fail(400, "Satu atau beberapa cabang tidak ditemukan.");

  const items: NormalizedPlanItem[] = normalized.map((item) => {
    const product = productById.get(item.productId)!;
    if (product.status !== "ACTIVE") fail(400, `Produk ${product.name} tidak aktif.`);
    for (const branchId of Object.keys(item.branchQtys)) {
      if (!isProductVisibleInBranch(product.visibleBranchIds, branchId)) {
        fail(400, `Produk ${product.name} tidak ditampilkan di ${branchNames.get(branchId)}.`);
      }
    }
    return {
      productId: product.id,
      productNameSnapshot: product.name,
      productBarcodeSnapshot: product.barcode,
      branchQtys: item.branchQtys,
    };
  });

  return { items, branchNames };
}

function buildBranchItems(items: NormalizedPlanItem[]): Map<string, ReceiptItem[]> {
  const grouped = new Map<string, ReceiptItem[]>();
  for (const item of items) {
    for (const [branchId, plannedQty] of Object.entries(item.branchQtys)) {
      const lines = grouped.get(branchId) ?? [];
      lines.push({
        productId: item.productId,
        productNameSnapshot: item.productNameSnapshot,
        productBarcodeSnapshot: item.productBarcodeSnapshot,
        plannedQty,
        actualQty: null,
        notAvailable: false,
      });
      grouped.set(branchId, lines);
    }
  }
  return grouped;
}

function readReceiptItems(value: Prisma.JsonValue): ReceiptItem[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item: any) => {
    if (
      !item ||
      typeof item.productId !== "string" ||
      typeof item.productNameSnapshot !== "string" ||
      !Number.isSafeInteger(item.plannedQty)
    ) {
      return [];
    }
    return [{
      productId: item.productId,
      productNameSnapshot: item.productNameSnapshot,
      productBarcodeSnapshot: typeof item.productBarcodeSnapshot === "string" ? item.productBarcodeSnapshot : null,
      plannedQty: item.plannedQty,
      actualQty: Number.isSafeInteger(item.actualQty) ? item.actualQty : null,
      notAvailable: item.notAvailable === true,
      ...(item.exceptionType === "SHORTAGE" || item.exceptionType === "NOT_AVAILABLE" || item.exceptionType === "EXTRA"
        ? { exceptionType: item.exceptionType }
        : {}),
      ...(Number.isSafeInteger(item.differenceQty) && item.differenceQty > 0
        ? { differenceQty: item.differenceQty }
        : {}),
      ...(typeof item.note === "string" && item.note.trim()
        ? { note: item.note.trim().slice(0, 300) }
        : {}),
    }];
  });
}

function samePlannedItems(left: ReceiptItem[], right: ReceiptItem[]): boolean {
  if (left.length !== right.length) return false;
  const a = [...left].sort((x, y) => x.productId.localeCompare(y.productId));
  const b = [...right].sort((x, y) => x.productId.localeCompare(y.productId));
  return a.every((item, index) =>
    item.productId === b[index].productId && item.plannedQty === b[index].plannedQty,
  );
}

function sendError(res: any, error: unknown, context: string) {
  if (error instanceof ShoppingPlanError) {
    return res.status(error.status).json({ error: error.message });
  }
  if (error && typeof error === "object" && "code" in error && error.code === "P2025") {
    return res.status(404).json({ error: "Rencana belanja tidak ditemukan." });
  }
  logger.error({ err: error, context }, "Shopping plan request failed");
  return res.status(500).json({ error: "Permintaan rencana belanja gagal diproses." });
}

function responsePayload<T extends { safeParse: (value: unknown) => any }>(schema: T, value: unknown) {
  const serialized = JSON.parse(JSON.stringify(value));
  const parsed = schema.safeParse(serialized);
  if (!parsed.success) {
    logger.error({ issues: parsed.error.issues }, "Shopping plan response did not match its API schema");
    throw new Error("Shopping plan response contract validation failed");
  }
  return parsed.data;
}

export function registerShoppingPlanRoutes(
  app: Express,
  prisma: PrismaClient,
  authenticateToken: any,
  requireRole: (...roles: string[]) => any,
  emitBranch: (branchId: string | null | undefined, event: string, payload: any) => void,
) {
  app.get("/api/shopping-plans", authenticateToken, requireRole("ADMIN"), async (_req, res) => {
    try {
      const plans = await prisma.shoppingPlan.findMany({
        orderBy: { createdAt: "desc" },
        include: {
          revisions: {
            select: { id: true, revisionNumber: true, title: true, createdAt: true },
            orderBy: { revisionNumber: "desc" },
          },
          receipts: {
            where: { status: { not: "SUPERSEDED" } },
            orderBy: { createdAt: "desc" },
            select: {
              id: true,
              shoppingPlanId: true,
              revisionId: true,
              branchId: true,
              branchNameSnapshot: true,
              status: true,
              items: true,
              receivedByNameSnapshot: true,
              confirmedAt: true,
              createdAt: true,
              revision: { select: { revisionNumber: true } },
            },
          },
        },
      });
      res.json(responsePayload(GetShoppingPlansResponse, plans));
    } catch (error) {
      sendError(res, error, "Get Shopping Plans Error");
    }
  });

  app.get(
    "/api/shopping-plans/receipts",
    authenticateToken,
    requireRole("CASHIER"),
    async (req: any, res) => {
      const branchId = req.user?.branchId;
      if (!branchId) return void res.status(403).json({ error: "Akun kasir belum terhubung ke cabang." });
      try {
        const receipts = await prisma.shoppingPlanReceipt.findMany({
          where: { branchId, status: { in: ["PENDING", "CONFIRMED", "NO_ITEMS"] } },
          orderBy: { createdAt: "desc" },
          take: 50,
          include: {
            shoppingPlan: { select: { id: true, title: true, status: true } },
            revision: { select: { revisionNumber: true, createdAt: true } },
          },
        });
        res.json(responsePayload(GetCashierShoppingPlanReceiptsResponse, receipts));
      } catch (error) {
        sendError(res, error, "Get Cashier Shopping Receipts Error");
      }
    },
  );

  app.get(
    "/api/shopping-plans/:id/revisions",
    authenticateToken,
    requireRole("ADMIN"),
    async (req, res) => {
      try {
        const revisions = await prisma.shoppingPlanRevision.findMany({
          where: { shoppingPlanId: req.params.id },
          orderBy: { revisionNumber: "desc" },
          select: { id: true, revisionNumber: true, title: true, items: true, creatorId: true, createdAt: true },
        });
        res.json(responsePayload(GetShoppingPlanRevisionsResponse, revisions));
      } catch (error) {
        sendError(res, error, "Get Shopping Plan Revisions Error");
      }
    },
  );

  app.post("/api/shopping-plans", authenticateToken, requireRole("ADMIN"), async (req: any, res) => {
    const parsedBody = CreateShoppingPlanBody.safeParse(req.body);
    if (!parsedBody.success) {
      return void res.status(400).json({ error: parsedBody.error.message });
    }
    const title = parsedBody.data.title.trim();
    const requestedStatus = parsedBody.data.status ?? "PUBLISHED";
    const status = requestedStatus;

    try {
      if (status === "DRAFT") {
        const draft = await prisma.shoppingPlan.create({
          data: {
            title,
            items: parsedBody.data.items as unknown as Prisma.InputJsonValue,
            status: "DRAFT",
            creatorId: req.user?.userId || null,
          },
        });
        return void res.status(201).json(draft);
      }

      const created = await prisma.$transaction(async (tx) => {
        const validated = await validateAndSnapshotItems(tx, parsedBody.data.items);
        const branchItems = buildBranchItems(validated.items);
        const plan = await tx.shoppingPlan.create({
          data: {
            title,
            items: validated.items as unknown as Prisma.InputJsonValue,
            status: "PUBLISHED",
            creatorId: req.user?.userId || null,
          },
        });
        const revision = await tx.shoppingPlanRevision.create({
          data: {
            shoppingPlanId: plan.id,
            revisionNumber: 1,
            title,
            items: validated.items as unknown as Prisma.InputJsonValue,
            creatorId: req.user?.userId || null,
          },
        });
        const receipts = [];
        for (const [branchId, items] of branchItems) {
          receipts.push(await tx.shoppingPlanReceipt.create({
            data: {
              shoppingPlanId: plan.id,
              revisionId: revision.id,
              branchId,
              branchNameSnapshot: validated.branchNames.get(branchId)!,
              status: "PENDING",
              items: items as unknown as Prisma.InputJsonValue,
            },
          }));
        }
        return { plan, revision, receipts, branchIds: [...branchItems.keys()] };
      });

      for (const branchId of created.branchIds) {
        emitBranch(branchId, "shoppingPlanUpdated", {
          shoppingPlanId: created.plan.id,
          revisionNumber: 1,
          branchId,
        });
      }
      res.status(201).json(responsePayload(CreateShoppingPlanResponse, {
        ...created.plan,
        revisions: [{ id: created.revision.id, revisionNumber: 1, title, createdAt: created.revision.createdAt }],
        receipts: created.receipts.map((receipt) => ({
          ...receipt,
          revision: { revisionNumber: 1 },
        })),
      }));
    } catch (error) {
      sendError(res, error, "Create Shopping Plan Error");
    }
  });

  app.patch("/api/shopping-plans/:id", authenticateToken, requireRole("ADMIN"), async (req: any, res) => {
    const parsedBody = ReviseShoppingPlanBody.safeParse(req.body);
    if (!parsedBody.success) {
      return void res.status(400).json({ error: parsedBody.error.message });
    }
    const title = parsedBody.data.title.trim();

    try {
      const updated = await prisma.$transaction(async (tx) => {
        await tx.$queryRaw<Array<{ id: string }>>`
          SELECT "id" FROM "ShoppingPlan" WHERE "id" = ${req.params.id} FOR UPDATE
        `;
        const plan = await tx.shoppingPlan.findUnique({
          where: { id: req.params.id },
          select: { id: true, title: true, status: true },
        });
        if (!plan) fail(404, "Rencana belanja tidak ditemukan.");
        if (plan.status === "COMPLETED") {
          fail(409, "Rencana sudah selesai. Buat rencana belanja baru untuk pembelian tambahan.");
        }

        const validated = await validateAndSnapshotItems(tx, parsedBody.data.items);
        const newBranchItems = buildBranchItems(validated.items);
        const currentReceipts = await tx.shoppingPlanReceipt.findMany({
          where: { shoppingPlanId: plan.id, status: { not: "SUPERSEDED" } },
          orderBy: { createdAt: "desc" },
        });
        const currentByBranch = new Map<string, (typeof currentReceipts)[number]>();
        for (const receipt of currentReceipts) {
          if (!currentByBranch.has(receipt.branchId)) currentByBranch.set(receipt.branchId, receipt);
        }

        const allBranchIds = new Set([...currentByBranch.keys(), ...newBranchItems.keys()]);
        const changes: Array<{ branchId: string; previous: (typeof currentReceipts)[number] | undefined; items: ReceiptItem[] }> = [];
        const titleChanged = plan.title !== title;
        for (const branchId of allBranchIds) {
          const previous = currentByBranch.get(branchId);
          const nextItems = newBranchItems.get(branchId) ?? [];
          const oldItems = previous ? readReceiptItems(previous.items) : [];
          const branchChanged = !samePlannedItems(oldItems, nextItems);
          const needsRevision = branchChanged || (titleChanged && previous?.status === "PENDING");
          if (!needsRevision) continue;
          if (previous?.status === "CONFIRMED" && branchChanged) {
            fail(
              409,
              `${previous.branchNameSnapshot} sudah mengonfirmasi penerimaan. Perubahan untuk cabang itu harus dibuat sebagai rencana belanja baru.`,
            );
          }
          changes.push({ branchId, previous, items: nextItems });
        }

        const latestRevision = await tx.shoppingPlanRevision.findFirst({
          where: { shoppingPlanId: plan.id },
          orderBy: { revisionNumber: "desc" },
          select: { revisionNumber: true },
        });
        const revisionNumber = (latestRevision?.revisionNumber ?? 0) + 1;
        const revision = await tx.shoppingPlanRevision.create({
          data: {
            shoppingPlanId: plan.id,
            revisionNumber,
            title,
            items: validated.items as unknown as Prisma.InputJsonValue,
            creatorId: req.user?.userId || null,
          },
        });

        const changedBranchIds: string[] = [];
        for (const change of changes) {
          if (change.previous?.status === "PENDING") {
            await tx.shoppingPlanReceipt.update({
              where: { id: change.previous.id },
              data: { status: "SUPERSEDED" },
            });
          }
          const branchName = change.previous?.branchNameSnapshot ?? validated.branchNames.get(change.branchId);
          if (!branchName) fail(400, "Nama cabang untuk revisi tidak ditemukan.");
          await tx.shoppingPlanReceipt.create({
            data: {
              shoppingPlanId: plan.id,
              revisionId: revision.id,
              branchId: change.branchId,
              branchNameSnapshot: branchName,
              status: change.items.length > 0 ? "PENDING" : "NO_ITEMS",
              items: change.items as unknown as Prisma.InputJsonValue,
            },
          });
          changedBranchIds.push(change.branchId);
        }

        const pendingCount = await tx.shoppingPlanReceipt.count({
          where: { shoppingPlanId: plan.id, status: "PENDING" },
        });
        const updatedPlan = await tx.shoppingPlan.update({
          where: { id: plan.id },
          data: {
            title,
            items: validated.items as unknown as Prisma.InputJsonValue,
            status: pendingCount > 0 ? "PUBLISHED" : "COMPLETED",
          },
        });
        const receipts = await tx.shoppingPlanReceipt.findMany({
          where: { shoppingPlanId: plan.id, status: { not: "SUPERSEDED" } },
          orderBy: { createdAt: "desc" },
          include: { revision: { select: { revisionNumber: true } } },
        });
        const revisions = await tx.shoppingPlanRevision.findMany({
          where: { shoppingPlanId: plan.id },
          orderBy: { revisionNumber: "desc" },
          select: { id: true, revisionNumber: true, title: true, createdAt: true },
        });
        return { plan: updatedPlan, revisionNumber, changedBranchIds, receipts, revisions };
      });

      for (const branchId of updated.changedBranchIds) {
        emitBranch(branchId, "shoppingPlanUpdated", {
          shoppingPlanId: updated.plan.id,
          revisionNumber: updated.revisionNumber,
          branchId,
        });
      }
      res.json(responsePayload(ReviseShoppingPlanResponse, {
        ...updated.plan,
        receipts: updated.receipts,
        revisions: updated.revisions,
      }));
    } catch (error) {
      sendError(res, error, "Revise Shopping Plan Error");
    }
  });

  app.post(
    "/api/shopping-plans/receipts/:receiptId/confirm",
    authenticateToken,
    requireRole("CASHIER"),
    async (req: any, res) => {
      const branchId = req.user?.branchId;
      if (!branchId) return void res.status(403).json({ error: "Akun kasir belum terhubung ke cabang." });
      if (Array.isArray(req.body?.items) && req.body.items.some((item: unknown) =>
        item && typeof item === "object" && ("actualQty" in item || "notAvailable" in item))) {
        return void res.status(400).json({
          error: "Format penerimaan lama tidak didukung. Muat ulang aplikasi Kasir lalu periksa kembali barang.",
        });
      }
      const parsedBody = ConfirmShoppingPlanReceiptBody.safeParse(req.body);
      if (!parsedBody.success) {
        return void res.status(400).json({ error: parsedBody.error.message });
      }

      try {
        const result = await prisma.$transaction(async (tx) => {
          const receipt = await tx.shoppingPlanReceipt.findUnique({
            where: { id: req.params.receiptId },
            include: {
              shoppingPlan: { select: { id: true, title: true } },
              revision: { select: { revisionNumber: true } },
            },
          });
          if (!receipt) fail(404, "Daftar penerimaan tidak ditemukan.");
          if (receipt.branchId !== branchId) fail(403, "Kasir hanya dapat mengonfirmasi penerimaan cabangnya sendiri.");
          if (receipt.status !== "PENDING") fail(409, "Penerimaan ini sudah ditutup atau diganti oleh revisi Owner.");

          const expectedItems = readReceiptItems(receipt.items);
          const submittedItems = parsedBody.data.items;
          if (!Array.isArray(submittedItems) || submittedItems.length !== expectedItems.length) {
            fail(400, "Periksa dan kirim pilihan untuk setiap produk.");
          }
          const submittedByProduct = new Map<string, (typeof submittedItems)[number]>();
          for (const item of submittedItems) {
            if (!item || typeof item.productId !== "string" || submittedByProduct.has(item.productId)) {
              fail(400, "Daftar produk penerimaan tidak valid.");
            }
            submittedByProduct.set(item.productId, item);
          }
          if (expectedItems.some((item) => !submittedByProduct.has(item.productId))) {
            fail(400, "Semua produk dalam daftar harus diperiksa.");
          }

          const confirmedItems: ReceiptItem[] = expectedItems.map((item): ReceiptItem => {
            const submitted = submittedByProduct.get(item.productId);
            if (!submitted) fail(400, "Semua produk dalam daftar harus diperiksa.");

            const exceptionType = submitted.exceptionType;
            if (!exceptionType) {
              if (submitted.differenceQty !== undefined || submitted.note !== undefined) {
                fail(400, "Pilih jenis selisih sebelum mengisi jumlah atau keterangan.");
              }
              return { ...item, actualQty: item.plannedQty, notAvailable: false };
            }

            const note = typeof submitted.note === "string" ? submitted.note.trim() : "";
            if (!note) fail(400, "Keterangan wajib diisi untuk produk yang kurang, tidak ada, atau lebih.");

            let actualQty = item.plannedQty;
            let differenceQty = 0;
            let notAvailable = false;
            if (exceptionType === "SHORTAGE") {
              const shortQty = submitted.differenceQty;
              if (typeof shortQty !== "number" || !Number.isSafeInteger(shortQty) || shortQty < 1 || shortQty >= item.plannedQty) {
                fail(400, "Masukkan jumlah yang kurang. Jika barang tidak ada sama sekali, pilih “Tidak ada”.");
              }
              differenceQty = shortQty;
              actualQty = item.plannedQty - shortQty;
            } else if (exceptionType === "NOT_AVAILABLE") {
              if (submitted.differenceQty !== undefined) {
                fail(400, "Untuk produk yang tidak ada, jumlah selisih dihitung otomatis.");
              }
              notAvailable = true;
              actualQty = 0;
              differenceQty = item.plannedQty;
            } else {
              const extraQty = submitted.differenceQty;
              if (typeof extraQty !== "number" || !Number.isSafeInteger(extraQty) || extraQty < 1 || !Number.isSafeInteger(item.plannedQty + extraQty)) {
                fail(400, "Masukkan jumlah pcs tambahan yang valid.");
              }
              differenceQty = extraQty;
              actualQty = item.plannedQty + extraQty;
            }
            return { ...item, actualQty, notAvailable, exceptionType, differenceQty, note };
          });

          const reserved = await tx.shoppingPlanReceipt.updateMany({
            where: { id: receipt.id, branchId, status: "PENDING" },
            data: {
              status: "CONFIRMED",
              items: confirmedItems as unknown as Prisma.InputJsonValue,
              receivedById: req.user.userId,
              receivedByNameSnapshot: req.user.name || req.user.username || "Kasir",
              confirmedAt: new Date(),
            },
          });
          if (reserved.count !== 1) fail(409, "Penerimaan sudah diproses oleh sesi lain.");

          for (const item of confirmedItems) {
            if (item.actualQty && item.actualQty > 0) {
              await applyStockDelta(tx, item.productId, branchId, item.actualQty);
              await tx.adjustment.create({
                data: {
                  productId: item.productId,
                  branchId,
                  qty: item.actualQty,
                  type: "STOCK_IN",
                  reason: `Penerimaan belanja ${receipt.shoppingPlan.title} revisi ${receipt.revision.revisionNumber}`,
                },
              });
            }
          }

          const pendingCount = await tx.shoppingPlanReceipt.count({
            where: { shoppingPlanId: receipt.shoppingPlanId, status: "PENDING" },
          });
          if (pendingCount === 0) {
            await tx.shoppingPlan.update({
              where: { id: receipt.shoppingPlanId },
              data: { status: "COMPLETED" },
            });
          }
          const confirmedReceipt = await tx.shoppingPlanReceipt.findUniqueOrThrow({
            where: { id: receipt.id },
            include: { revision: { select: { revisionNumber: true } } },
          });
          return { receipt: confirmedReceipt, planId: receipt.shoppingPlanId };
        });

        for (const item of readReceiptItems(result.receipt.items)) {
          if (item.actualQty && item.actualQty > 0) {
            emitBranch(branchId, "stockUpdated", {
              productId: item.productId,
              branchId,
              qty: item.actualQty,
            });
          }
        }
        emitBranch(branchId, "shoppingPlanUpdated", {
          shoppingPlanId: result.planId,
          receiptId: result.receipt.id,
          branchId,
        });
        res.json(responsePayload(ConfirmShoppingPlanReceiptResponse, result.receipt));
      } catch (error) {
        sendError(res, error, "Confirm Shopping Plan Receipt Error");
      }
    },
  );

  app.delete("/api/shopping-plans/:id", authenticateToken, requireRole("ADMIN"), async (req, res) => {
    try {
      const plan = await prisma.shoppingPlan.findUnique({
        where: { id: req.params.id },
        select: { id: true, status: true },
      });
      if (!plan) return void res.status(404).json({ error: "Rencana belanja tidak ditemukan." });
      const receiptCount = await prisma.shoppingPlanReceipt.count({ where: { shoppingPlanId: plan.id } });
      if (receiptCount > 0 || plan.status !== "DRAFT") {
        return void res.status(409).json({ error: "Rencana yang sudah diterbitkan tidak dapat dihapus agar riwayat tetap utuh." });
      }
      await prisma.shoppingPlan.delete({ where: { id: plan.id } });
      res.json({ success: true });
    } catch (error) {
      sendError(res, error, "Delete Shopping Plan Error");
    }
  });
}
