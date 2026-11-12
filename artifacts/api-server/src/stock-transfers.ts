import type { Prisma, PrismaClient } from "@prisma/client";
import type { Application, RequestHandler } from "express";
import { randomUUID } from "node:crypto";
import { logger } from "./lib/logger";
import { lockBranch, ShiftConflict } from "./shift-safety";
import { isProductVisibleInBranch, lockProductStatus, ProductLifecycleConflict } from "./product-lifecycle";

type TransferActor = {
  userId: string;
  role: "ADMIN" | "AUDIT" | "CASHIER" | string;
  branchId: string | null;
};

type EmitBranch = (branchId: string | null | undefined, event: string, payload: any) => void;

const transferInclude = {
  product: { select: { id: true, name: true, barcode: true, brand: true, category: true } },
  sourceBranch: { select: { id: true, name: true } },
  targetBranch: { select: { id: true, name: true } },
  requestedBy: { select: { id: true, name: true, username: true } },
  acceptedBy: { select: { id: true, name: true, username: true } },
  dispatchedBy: { select: { id: true, name: true, username: true } },
  receivedBy: { select: { id: true, name: true, username: true } },
  closedBy: { select: { id: true, name: true, username: true } },
  skuCorrections: {
    orderBy: { createdAt: "desc" },
    take: 5,
    include: {
      actualProduct: { select: { id: true, name: true, barcode: true, brand: true, category: true } },
      reportedBy: { select: { id: true, name: true, username: true } },
      reviewedBy: { select: { id: true, name: true, username: true } },
      receivedBy: { select: { id: true, name: true, username: true } },
    },
  },
} satisfies Prisma.StockTransferInclude;

class TransferHttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly code?: string,
  ) {
    super(message);
  }
}

const positiveInt = (value: unknown): number | null => {
  if (typeof value !== "number" && typeof value !== "string") return null;
  if (typeof value === "string" && value.trim() === "") return null;
  const number = Number(value);
  return Number.isSafeInteger(number) && number > 0 ? number : null;
};

const nonnegativeInt = (value: unknown): number | null => {
  if (typeof value !== "number" && typeof value !== "string") return null;
  if (typeof value === "string" && value.trim() === "") return null;
  const number = Number(value);
  return Number.isSafeInteger(number) && number >= 0 ? number : null;
};

function parseNote(value: unknown, label: string): string | null {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string") throw new TransferHttpError(400, `${label} harus berupa teks.`);
  const note = value.trim();
  if (note.length > 500) throw new TransferHttpError(400, `${label} maksimal 500 karakter.`);
  return note || null;
}

function getActor(req: any): TransferActor {
  return req.user as TransferActor;
}

function requireCashierBranch(actor: TransferActor): string {
  if (!actor.branchId) throw new TransferHttpError(403, "Akun kasir belum terhubung ke cabang.");
  return actor.branchId;
}

function cashierBranchOrRespond(
  req: any,
  res: any,
  actor: TransferActor,
  message: string,
): string | null {
  try {
    return requireCashierBranch(actor);
  } catch (error) {
    respondError(req, res, error, message);
    return null;
  }
}

async function requireOpenShift(
  tx: Prisma.TransactionClient,
  actor: TransferActor,
  branchId: string,
): Promise<void> {
  if (actor.role !== "CASHIER") return;
  const shift = await tx.shift.findFirst({
    where: { branchId, cashierId: actor.userId, status: "open" },
    select: { id: true },
  });
  if (!shift) throw new ShiftConflict("Shift kasir belum dibuka atau sudah ditutup.");
}

async function assertBranchPair(
  tx: Prisma.TransactionClient,
  sourceBranchId: string,
  targetBranchId: string,
): Promise<void> {
  if (sourceBranchId === targetBranchId) {
    throw new TransferHttpError(400, "Cabang asal dan tujuan tidak boleh sama.");
  }
  const branches = await tx.branch.findMany({
    where: { id: { in: [sourceBranchId, targetBranchId] } },
    select: { id: true },
  });
  if (branches.length !== 2) throw new TransferHttpError(404, "Cabang asal atau tujuan tidak ditemukan.");
}

async function lockTransferBranches(
  tx: Prisma.TransactionClient,
  sourceBranchId: string,
  targetBranchId: string,
): Promise<void> {
  for (const branchId of [sourceBranchId, targetBranchId].sort()) {
    await lockBranch(tx, branchId);
  }
}

async function assertProductCanBeTransferred(
  tx: Prisma.TransactionClient,
  productId: string,
  targetBranchId: string,
): Promise<void> {
  const product = await lockProductStatus(tx, productId);
  if (!product) throw new TransferHttpError(404, "Produk tidak ditemukan.");
  if (product.status !== "ACTIVE") {
    throw new ProductLifecycleConflict("Produk nonaktif. Aktifkan kembali sebelum transfer stok.");
  }
  const details = await tx.product.findUnique({
    where: { id: productId },
    select: { visibleBranchIds: true },
  });
  if (!details || !isProductVisibleInBranch(details.visibleBranchIds, targetBranchId)) {
    throw new TransferHttpError(409, "Produk tidak diizinkan tampil di cabang tujuan.", "PRODUCT_HIDDEN_IN_TARGET");
  }
}

async function fetchTransfer(
  prisma: PrismaClient,
  id: string,
) {
  return prisma.stockTransfer.findUnique({ where: { id }, include: transferInclude });
}

function respondError(req: any, res: any, error: unknown, message: string): void {
  if (error instanceof TransferHttpError) {
    res.status(error.status).json({
      error: error.message,
      ...(error.code ? { code: error.code } : {}),
    });
    return;
  }
  if (error instanceof ShiftConflict) {
    res.status(error.status).json({ error: error.message });
    return;
  }
  if (error instanceof ProductLifecycleConflict) {
    res.status(409).json({ error: error.message });
    return;
  }
  logger.error({ err: error, path: req.path }, message);
  res.status(500).json({ error: message });
}

function emitTransferUpdate(
  emitBranch: EmitBranch,
  sourceBranchId: string,
  targetBranchId: string,
  transferId: string,
  status: string,
): void {
  const payload = { id: transferId, status };
  emitBranch(sourceBranchId, "stockTransferUpdated", payload);
  emitBranch(targetBranchId, "stockTransferUpdated", payload);
}

export function registerStockTransferRoutes(
  app: Application,
  prisma: PrismaClient,
  authenticateToken: RequestHandler,
  requireRole: (...roles: string[]) => RequestHandler,
  emitBranch: EmitBranch,
): void {
  const access = [authenticateToken, requireRole("ADMIN", "AUDIT", "CASHIER")];

  app.get("/api/stock-transfers", ...access, async (req: any, res): Promise<void> => {
    const actor = getActor(req);
    const allowedStatuses = new Set(["REQUESTED", "ACCEPTED", "IN_TRANSIT", "RECEIVED", "REJECTED", "CANCELLED"]);
    const status = typeof req.query.status === "string" ? req.query.status : undefined;
    if (status && !allowedStatuses.has(status)) {
      res.status(400).json({ error: "Status transfer tidak valid." });
      return;
    }
    const rawLimit = Number(req.query.limit ?? 100);
    if (!Number.isInteger(rawLimit) || rawLimit < 1) {
      res.status(400).json({ error: "Batas riwayat transfer tidak valid." });
      return;
    }
    const limit = Math.min(rawLimit, 100);
    const branchId = actor.role === "CASHIER"
      ? cashierBranchOrRespond(req, res, actor, "Riwayat transfer gagal dimuat.")
      : (typeof req.query.branchId === "string" ? req.query.branchId : undefined);
    if (actor.role === "CASHIER" && !branchId) return;
    const where: Prisma.StockTransferWhereInput = {
      ...(status ? { status } : {}),
      ...(actor.role === "CASHIER"
        ? { OR: [{ sourceBranchId: branchId }, { targetBranchId: branchId }] }
        : branchId
          ? { OR: [{ sourceBranchId: branchId }, { targetBranchId: branchId }] }
          : {}),
    };
    try {
      const rows = await prisma.stockTransfer.findMany({
        where,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: limit + 1,
        include: transferInclude,
      });
      res.json({ items: rows.slice(0, limit), hasMore: rows.length > limit });
    } catch (error) {
      respondError(req, res, error, "Riwayat transfer gagal dimuat.");
    }
  });

  app.post("/api/stock-transfers/requests", ...access, async (req: any, res): Promise<void> => {
    res.status(410).json({
      error: "Fitur minta stok sudah dihentikan. Buat kiriman langsung beberapa produk ke cabang tujuan.",
      code: "STOCK_REQUESTS_RETIRED",
    });
  });

  app.post("/api/stocks/transfer-batch", ...access, async (req: any, res): Promise<void> => {
    const actor = getActor(req);
    const sourceBranchId = actor.role === "CASHIER"
      ? cashierBranchOrRespond(req, res, actor, "Pengiriman transfer gagal dibuat.")
      : (typeof req.body?.sourceBranchId === "string" ? req.body.sourceBranchId.trim() : "");
    if (actor.role === "CASHIER" && !sourceBranchId) return;
    const targetBranchId = typeof req.body?.targetBranchId === "string" ? req.body.targetBranchId.trim() : "";
    const rawItems = req.body?.items;
    let note: string | null;
    try {
      note = parseNote(req.body?.note, "Catatan pengiriman");
    } catch (error) {
      respondError(req, res, error, "Pengiriman transfer gagal dibuat.");
      return;
    }
    if (!sourceBranchId || !targetBranchId || !Array.isArray(rawItems) ||
        rawItems.length < 1 || rawItems.length > 50) {
      res.status(400).json({ error: "Cabang asal, cabang tujuan, dan 1–50 baris produk wajib diisi." });
      return;
    }
    if (actor.role === "CASHIER" && req.body?.sourceBranchId &&
        req.body.sourceBranchId !== actor.branchId) {
      res.status(403).json({ error: "Kasir hanya dapat mengirim stok dari cabangnya sendiri." });
      return;
    }
    const items: Array<{ productId: string; qty: number }> = [];
    const seenProductIds = new Set<string>();
    for (const value of rawItems) {
      const productId = typeof value?.productId === "string" ? value.productId.trim() : "";
      const qty = positiveInt(value?.qty);
      if (!productId || qty === null) {
        res.status(400).json({ error: "Setiap produk harus memiliki ID dan jumlah pcs positif." });
        return;
      }
      if (seenProductIds.has(productId)) {
        res.status(400).json({ error: "Produk yang sama tidak boleh muncul dua kali dalam satu kiriman." });
        return;
      }
      seenProductIds.add(productId);
      items.push({ productId, qty });
    }

    const batchId = randomUUID();
    try {
      const transfers = await prisma.$transaction(async (tx) => {
        await lockTransferBranches(tx, sourceBranchId, targetBranchId);
        await requireOpenShift(tx, actor, sourceBranchId);
        await assertBranchPair(tx, sourceBranchId, targetBranchId);

        const prepared: Array<{
          productId: string;
          qty: number;
          product: { id: string; name: string };
        }> = [];
        for (const item of items) {
          await assertProductCanBeTransferred(tx, item.productId, targetBranchId);
          const [product, stock] = await Promise.all([
            tx.product.findUnique({
              where: { id: item.productId },
              select: { id: true, name: true },
            }),
            tx.productStock.findUnique({
              where: {
                productId_branchId: {
                  productId: item.productId,
                  branchId: sourceBranchId,
                },
              },
              select: { qty: true },
            }),
          ]);
          if (!product) throw new TransferHttpError(404, "Produk tidak ditemukan.");
          if (!stock || stock.qty < item.qty) {
            throw new TransferHttpError(
              409,
              `Stok ${product.name} tidak cukup untuk kiriman. Tidak ada stok yang diubah.`,
              "INSUFFICIENT_STOCK",
            );
          }
          prepared.push({ ...item, product });
        }

        const created = [];
        for (const item of prepared) {
          const decremented = await tx.productStock.updateMany({
            where: {
              productId: item.productId,
              branchId: sourceBranchId,
              qty: { gte: item.qty },
            },
            data: { qty: { decrement: item.qty } },
          });
          if (decremented.count !== 1) {
            throw new TransferHttpError(
              409,
              `Stok ${item.product.name} berubah dan tidak cukup. Kiriman dibatalkan tanpa perubahan.`,
              "INSUFFICIENT_STOCK",
            );
          }
          const transfer = await tx.stockTransfer.create({
            data: {
              batchId,
              productId: item.productId,
              sourceBranchId,
              targetBranchId,
              kind: "DIRECT",
              status: "IN_TRANSIT",
              dispatchedQty: item.qty,
              requestNote: note,
              requestedById: actor.userId,
              dispatchedById: actor.userId,
              dispatchedAt: new Date(),
            },
            include: transferInclude,
          });
          await tx.adjustment.create({
            data: {
              productId: item.productId,
              branchId: sourceBranchId,
              qty: item.qty,
              type: "TRANSFER_OUT",
              reason: `Kiriman ${batchId} dikirim ke ${transfer.targetBranch.name}`,
            },
          });
          created.push(transfer);
        }
        return created;
      });

      for (const transfer of transfers) {
        const sourceStock = await prisma.productStock.findUnique({
          where: {
            productId_branchId: {
              productId: transfer.productId,
              branchId: sourceBranchId,
            },
          },
          select: { qty: true },
        });
        emitBranch(sourceBranchId, "stockUpdated", {
          productId: transfer.productId,
          branchId: sourceBranchId,
          qty: sourceStock?.qty ?? 0,
        });
        emitTransferUpdate(emitBranch, sourceBranchId, targetBranchId, transfer.id, transfer.status);
      }
      res.status(201).json({ batchId, items: transfers });
    } catch (error) {
      respondError(req, res, error, "Pengiriman transfer gagal dibuat.");
    }
  });

  app.post("/api/stocks/transfer", ...access, async (req: any, res): Promise<void> => {
    const actor = getActor(req);
    const productId = typeof req.body?.productId === "string" ? req.body.productId.trim() : "";
    const qty = positiveInt(req.body?.qty);
    let note: string | null;
    try {
      note = parseNote(req.body?.note, "Catatan pengiriman");
    } catch (error) {
      respondError(req, res, error, "Pengiriman transfer gagal dibuat.");
      return;
    }
    const sourceBranchId = actor.role === "CASHIER"
      ? cashierBranchOrRespond(req, res, actor, "Pengiriman transfer gagal dibuat.")
      : (typeof req.body?.sourceBranchId === "string" ? req.body.sourceBranchId.trim() : "");
    if (actor.role === "CASHIER" && !sourceBranchId) return;
    const targetBranchId = typeof req.body?.targetBranchId === "string" ? req.body.targetBranchId.trim() : "";
    if (!productId || !sourceBranchId || !targetBranchId || qty === null) {
      res.status(400).json({ error: "Produk, cabang asal, cabang tujuan, dan jumlah positif wajib diisi." });
      return;
    }
    if (actor.role === "CASHIER" && req.body?.sourceBranchId && req.body.sourceBranchId !== actor.branchId) {
      res.status(403).json({ error: "Kasir hanya dapat mengirim stok dari cabangnya sendiri." });
      return;
    }

    try {
      const result = await prisma.$transaction(async (tx) => {
        await lockBranch(tx, sourceBranchId);
        await requireOpenShift(tx, actor, sourceBranchId);
        await assertBranchPair(tx, sourceBranchId, targetBranchId);
        await assertProductCanBeTransferred(tx, productId, targetBranchId);
        const decremented = await tx.productStock.updateMany({
          where: { productId, branchId: sourceBranchId, qty: { gte: qty } },
          data: { qty: { decrement: qty } },
        });
        if (decremented.count !== 1) {
          throw new TransferHttpError(409, "Stok cabang asal tidak mencukupi.", "INSUFFICIENT_STOCK");
        }
        const transfer = await tx.stockTransfer.create({
          data: {
            batchId: randomUUID(),
            productId,
            sourceBranchId,
            targetBranchId,
            kind: "DIRECT",
            status: "IN_TRANSIT",
            dispatchedQty: qty,
            requestNote: note,
            requestedById: actor.userId,
            dispatchedById: actor.userId,
            dispatchedAt: new Date(),
          },
          include: transferInclude,
        });
        await tx.adjustment.create({
          data: {
            productId,
            branchId: sourceBranchId,
            qty,
            type: "TRANSFER_OUT",
            reason: `Transfer ${transfer.id} dikirim ke ${transfer.targetBranch.name}`,
          },
        });
        const sourceStock = await tx.productStock.findUnique({
          where: { productId_branchId: { productId, branchId: sourceBranchId } },
          select: { qty: true },
        });
        return { transfer, sourceQty: sourceStock?.qty ?? 0 };
      });
      emitBranch(sourceBranchId, "stockUpdated", {
        productId,
        branchId: sourceBranchId,
        qty: result.sourceQty,
      });
      emitTransferUpdate(emitBranch, sourceBranchId, targetBranchId, result.transfer.id, result.transfer.status);
      res.status(201).json(result.transfer);
    } catch (error) {
      respondError(req, res, error, "Pengiriman transfer gagal dibuat.");
    }
  });

  app.post("/api/stock-transfers/batches/:batchId/receive", ...access, async (req: any, res): Promise<void> => {
    const actor = getActor(req);
    if (actor.role !== "CASHIER") {
      res.status(403).json({ error: "Penerimaan kiriman harus dikonfirmasi kasir cabang tujuan." });
      return;
    }
    const batchId = typeof req.params.batchId === "string" ? req.params.batchId : "";
    if (!batchId) {
      res.status(400).json({ error: "ID kiriman tidak valid." });
      return;
    }
    try {
      const targetBranchId = requireCashierBranch(actor);
      const transfers = await prisma.$transaction(async (tx) => {
        await lockBranch(tx, targetBranchId);
        await requireOpenShift(tx, actor, targetBranchId);
        const rows = await tx.stockTransfer.findMany({
          where: { batchId },
          orderBy: [{ createdAt: "asc" }, { id: "asc" }],
          include: transferInclude,
        });
        if (rows.length === 0) throw new TransferHttpError(404, "Kiriman tidak ditemukan untuk cabang Anda.");
        if (rows.some((row) => row.targetBranchId !== targetBranchId)) {
          throw new TransferHttpError(403, "Hanya kasir cabang tujuan yang dapat mengonfirmasi kiriman.");
        }
        if (rows.some((row) => row.status !== "IN_TRANSIT" || !row.dispatchedQty)) {
          throw new TransferHttpError(409, "Ada produk dalam kiriman yang sudah diproses atau belum dikirim.");
        }
        const activeCorrections = await tx.stockTransferSkuCorrection.findFirst({
          where: {
            transferId: { in: rows.map((row) => row.id) },
            status: { in: ["PENDING_SOURCE", "APPROVED_PENDING_RECEIPT"] },
          },
          select: { id: true },
        });
        if (activeCorrections) {
          throw new TransferHttpError(
            409,
            "Kiriman memiliki laporan SKU yang perlu ditangani per produk terlebih dahulu.",
            "SKU_CORRECTION_PENDING",
          );
        }
        const received = [];
        for (const row of rows) {
          const changed = await tx.stockTransfer.updateMany({
            where: { id: row.id, batchId, status: "IN_TRANSIT" },
            data: {
              status: "RECEIVED",
              receivedQty: row.dispatchedQty,
              receivedById: actor.userId,
              receivedAt: new Date(),
              discrepancyNote: null,
            },
          });
          if (changed.count !== 1) {
            throw new TransferHttpError(409, "Kiriman berubah. Muat ulang sebelum mengonfirmasi.");
          }
          const targetStock = await tx.productStock.upsert({
            where: {
              productId_branchId: {
                productId: row.productId,
                branchId: targetBranchId,
              },
            },
            update: { qty: { increment: row.dispatchedQty! } },
            create: {
              productId: row.productId,
              branchId: targetBranchId,
              qty: row.dispatchedQty!,
            },
            select: { qty: true },
          });
          await tx.adjustment.create({
            data: {
              productId: row.productId,
              branchId: targetBranchId,
              qty: row.dispatchedQty!,
              type: "TRANSFER_IN",
              reason: `Kiriman ${batchId} diterima dari cabang sumber`,
            },
          });
          const updated = await tx.stockTransfer.findUniqueOrThrow({
            where: { id: row.id },
            include: transferInclude,
          });
          received.push({ row: updated, targetQty: targetStock.qty });
        }
        return received;
      });
      for (const { row, targetQty } of transfers) {
        emitBranch(targetBranchId, "stockUpdated", {
          productId: row.productId,
          branchId: targetBranchId,
          qty: targetQty,
        });
        emitTransferUpdate(emitBranch, row.sourceBranchId, targetBranchId, row.id, "RECEIVED");
      }
      res.json({ batchId, items: transfers.map(({ row }) => row) });
    } catch (error) {
      respondError(req, res, error, "Konfirmasi kiriman gagal disimpan.");
    }
  });

  app.patch("/api/stock-transfers/:id/respond", ...access, async (req: any, res): Promise<void> => {
    const actor = getActor(req);
    const id = typeof req.params.id === "string" ? req.params.id : "";
    const action = req.body?.action;
    let note: string | null;
    try {
      note = parseNote(req.body?.note, "Catatan respons");
    } catch (error) {
      respondError(req, res, error, "Respons permintaan transfer gagal disimpan.");
      return;
    }
    const approvedQty = action === "ACCEPT" ? positiveInt(req.body?.qty) : null;
    if (!id || !["ACCEPT", "REJECT"].includes(action) || (action === "ACCEPT" && approvedQty === null)) {
      res.status(400).json({ error: "Respons harus menerima dengan jumlah positif atau menolak permintaan." });
      return;
    }
    try {
      const result = await prisma.$transaction(async (tx) => {
        const current = await tx.stockTransfer.findUnique({ where: { id } });
        if (!current) throw new TransferHttpError(404, "Permintaan transfer tidak ditemukan.");
        if (current.kind !== "REQUEST" || current.status !== "REQUESTED") {
          throw new TransferHttpError(409, "Permintaan ini sudah diproses.");
        }
        if (actor.role === "CASHIER" && current.sourceBranchId !== actor.branchId) {
          throw new TransferHttpError(403, "Hanya cabang sumber yang dapat merespons permintaan ini.");
        }
        await lockBranch(tx, current.sourceBranchId);
        await requireOpenShift(tx, actor, current.sourceBranchId);
        if (action === "ACCEPT") {
          if (approvedQty! > (current.requestedQty ?? 0)) {
            throw new TransferHttpError(400, "Jumlah persetujuan tidak boleh melebihi jumlah yang diminta.");
          }
          const availableStock = await tx.productStock.findUnique({
            where: {
              productId_branchId: {
                productId: current.productId,
                branchId: current.sourceBranchId,
              },
            },
            select: { qty: true },
          });
          if (!availableStock || approvedQty! > availableStock.qty) {
            throw new TransferHttpError(409, "Stok sumber tidak cukup untuk jumlah yang disetujui.", "INSUFFICIENT_STOCK");
          }
        }
        const changed = await tx.stockTransfer.updateMany({
          where: { id, status: "REQUESTED", kind: "REQUEST" },
          data: action === "ACCEPT"
            ? {
                status: "ACCEPTED",
                approvedQty,
                acceptedById: actor.userId,
                acceptedAt: new Date(),
                responseNote: note,
              }
            : {
                status: "REJECTED",
                closedById: actor.userId,
                closedAt: new Date(),
                responseNote: note,
              },
        });
        if (changed.count !== 1) throw new TransferHttpError(409, "Permintaan sudah berubah. Muat ulang daftar.");
        return tx.stockTransfer.findUniqueOrThrow({ where: { id }, include: transferInclude });
      });
      emitTransferUpdate(emitBranch, result.sourceBranchId, result.targetBranchId, result.id, result.status);
      res.json(result);
    } catch (error) {
      respondError(req, res, error, "Respons permintaan transfer gagal disimpan.");
    }
  });

  app.post("/api/stock-transfers/:id/dispatch", ...access, async (req: any, res): Promise<void> => {
    const actor = getActor(req);
    const id = typeof req.params.id === "string" ? req.params.id : "";
    if (!id) {
      res.status(400).json({ error: "ID transfer tidak valid." });
      return;
    }
    try {
      const result = await prisma.$transaction(async (tx) => {
        const current = await tx.stockTransfer.findUnique({ where: { id } });
        if (!current) throw new TransferHttpError(404, "Transfer tidak ditemukan.");
        if (current.kind !== "REQUEST" || current.status !== "ACCEPTED" || !current.approvedQty) {
          throw new TransferHttpError(409, "Transfer belum disetujui atau sudah dikirim.");
        }
        if (actor.role === "CASHIER" && current.sourceBranchId !== actor.branchId) {
          throw new TransferHttpError(403, "Hanya cabang sumber yang dapat mengirim barang.");
        }
        await lockBranch(tx, current.sourceBranchId);
        await requireOpenShift(tx, actor, current.sourceBranchId);
        await assertProductCanBeTransferred(tx, current.productId, current.targetBranchId);
        const changed = await tx.stockTransfer.updateMany({
          where: { id, status: "ACCEPTED", kind: "REQUEST" },
          data: {
            status: "IN_TRANSIT",
            dispatchedQty: current.approvedQty,
            dispatchedById: actor.userId,
            dispatchedAt: new Date(),
          },
        });
        if (changed.count !== 1) throw new TransferHttpError(409, "Transfer sudah berubah. Muat ulang daftar.");
        const decremented = await tx.productStock.updateMany({
          where: {
            productId: current.productId,
            branchId: current.sourceBranchId,
            qty: { gte: current.approvedQty },
          },
          data: { qty: { decrement: current.approvedQty } },
        });
        if (decremented.count !== 1) {
          throw new TransferHttpError(409, "Stok cabang sumber berubah dan tidak mencukupi.", "INSUFFICIENT_STOCK");
        }
        const sourceStock = await tx.productStock.findUnique({
          where: { productId_branchId: { productId: current.productId, branchId: current.sourceBranchId } },
          select: { qty: true },
        });
        await tx.adjustment.create({
          data: {
            productId: current.productId,
            branchId: current.sourceBranchId,
            qty: current.approvedQty,
            type: "TRANSFER_OUT",
            reason: `Transfer ${id} dikirim ke cabang tujuan`,
          },
        });
        const transfer = await tx.stockTransfer.findUniqueOrThrow({ where: { id }, include: transferInclude });
        return { transfer, sourceQty: sourceStock?.qty ?? 0 };
      });
      emitBranch(result.transfer.sourceBranchId, "stockUpdated", {
        productId: result.transfer.productId,
        branchId: result.transfer.sourceBranchId,
        qty: result.sourceQty,
      });
      emitTransferUpdate(
        emitBranch,
        result.transfer.sourceBranchId,
        result.transfer.targetBranchId,
        result.transfer.id,
        result.transfer.status,
      );
      res.json(result.transfer);
    } catch (error) {
      respondError(req, res, error, "Pengiriman transfer gagal dicatat.");
    }
  });

  app.post("/api/stock-transfers/:id/sku-corrections", ...access, async (req: any, res): Promise<void> => {
    const actor = getActor(req);
    const id = typeof req.params.id === "string" ? req.params.id : "";
    const actualProductId = typeof req.body?.actualProductId === "string" ? req.body.actualProductId.trim() : "";
    const actualQty = positiveInt(req.body?.actualQty);
    let note: string | null;
    try {
      note = parseNote(req.body?.note, "Alasan koreksi");
    } catch (error) {
      respondError(req, res, error, "Laporan koreksi SKU gagal disimpan.");
      return;
    }
    if (!id || !actualProductId || actualQty === null || !note) {
      res.status(400).json({ error: "Transfer, produk SKU aktual, jumlah, dan alasan koreksi wajib diisi." });
      return;
    }
    if (actor.role !== "CASHIER") {
      res.status(403).json({ error: "Laporan SKU aktual harus dibuat oleh kasir cabang penerima." });
      return;
    }
    try {
      const targetBranchId = requireCashierBranch(actor);
      const transfer = await prisma.$transaction(async (tx) => {
        await lockBranch(tx, targetBranchId);
        await requireOpenShift(tx, actor, targetBranchId);
        const current = await tx.stockTransfer.findUnique({ where: { id } });
        if (!current) throw new TransferHttpError(404, "Transfer tidak ditemukan.");
        if (current.targetBranchId !== targetBranchId) {
          throw new TransferHttpError(403, "Transfer ini bukan untuk cabang penerima Anda.");
        }
        if (current.status !== "IN_TRANSIT" || !current.dispatchedQty) {
          throw new TransferHttpError(409, "Hanya transfer yang sudah dikirim dan belum diterima yang dapat dikoreksi.");
        }
        if (actualProductId === current.productId) {
          throw new TransferHttpError(400, "SKU aktual sama dengan SKU transfer. Gunakan konfirmasi jumlah biasa.");
        }
        await assertProductCanBeTransferred(tx, actualProductId, current.targetBranchId);
        const activeCorrection = await tx.stockTransferSkuCorrection.findFirst({
          where: { transferId: id, status: { in: ["PENDING_SOURCE", "APPROVED_PENDING_RECEIPT"] } },
          select: { id: true },
        });
        if (activeCorrection) {
          throw new TransferHttpError(409, "Koreksi SKU sebelumnya masih diproses.");
        }
        await tx.stockTransferSkuCorrection.create({
          data: {
            transferId: id,
            actualProductId,
            actualQty,
            note,
            status: "PENDING_SOURCE",
            reportedById: actor.userId,
          },
        });
        return tx.stockTransfer.findUniqueOrThrow({ where: { id }, include: transferInclude });
      });
      emitTransferUpdate(emitBranch, transfer.sourceBranchId, transfer.targetBranchId, transfer.id, transfer.status);
      res.status(201).json(transfer);
    } catch (error) {
      respondError(req, res, error, "Laporan koreksi SKU gagal disimpan.");
    }
  });

  app.patch("/api/stock-transfers/:id/sku-corrections/:correctionId", ...access, async (req: any, res): Promise<void> => {
    const actor = getActor(req);
    const id = typeof req.params.id === "string" ? req.params.id : "";
    const correctionId = typeof req.params.correctionId === "string" ? req.params.correctionId : "";
    const action = req.body?.action;
    let responseNote: string | null;
    try {
      responseNote = parseNote(req.body?.responseNote, "Catatan respons");
    } catch (error) {
      respondError(req, res, error, "Respons koreksi SKU gagal disimpan.");
      return;
    }
    if (!id || !correctionId || (action !== "APPROVE" && action !== "REJECT")) {
      res.status(400).json({ error: "Transfer, koreksi, dan tindakan persetujuan yang valid wajib diisi." });
      return;
    }
    if (action === "REJECT" && !responseNote) {
      res.status(400).json({ error: "Alasan penolakan koreksi wajib diisi." });
      return;
    }
    try {
      const result = await prisma.$transaction(async (tx) => {
        const correction = await tx.stockTransferSkuCorrection.findUnique({
          where: { id: correctionId },
          include: { transfer: true },
        });
        if (!correction || correction.transferId !== id) {
          throw new TransferHttpError(404, "Laporan koreksi SKU tidak ditemukan.");
        }
        const current = correction.transfer;
        if (actor.role === "CASHIER" && current.sourceBranchId !== actor.branchId) {
          throw new TransferHttpError(403, "Hanya kasir cabang pengirim yang dapat menilai koreksi SKU.");
        }
        if (current.status !== "IN_TRANSIT" || correction.status !== "PENDING_SOURCE") {
          throw new TransferHttpError(409, "Laporan koreksi SKU sudah berubah atau transfer tidak lagi menunggu penerimaan.");
        }
        await lockTransferBranches(tx, current.sourceBranchId, current.targetBranchId);
        await requireOpenShift(tx, actor, current.sourceBranchId);

        if (action === "REJECT") {
          const changed = await tx.stockTransferSkuCorrection.updateMany({
            where: { id: correctionId, status: "PENDING_SOURCE" },
            data: {
              status: "REJECTED",
              responseNote,
              reviewedById: actor.userId,
              reviewedAt: new Date(),
            },
          });
          if (changed.count !== 1) throw new TransferHttpError(409, "Koreksi SKU sudah ditangani. Muat ulang daftar.");
          const transfer = await tx.stockTransfer.findUniqueOrThrow({ where: { id }, include: transferInclude });
          return { transfer, sourceStockUpdates: [] as { productId: string; qty: number }[] };
        }

        await assertProductCanBeTransferred(tx, correction.actualProductId, current.targetBranchId);
        const changed = await tx.stockTransferSkuCorrection.updateMany({
          where: { id: correctionId, status: "PENDING_SOURCE" },
          data: {
            status: "APPROVED_PENDING_RECEIPT",
            responseNote,
            reviewedById: actor.userId,
            reviewedAt: new Date(),
          },
        });
        if (changed.count !== 1) throw new TransferHttpError(409, "Koreksi SKU sudah ditangani. Muat ulang daftar.");

        const actualStockDecremented = await tx.productStock.updateMany({
          where: {
            productId: correction.actualProductId,
            branchId: current.sourceBranchId,
            qty: { gte: correction.actualQty },
          },
          data: { qty: { decrement: correction.actualQty } },
        });
        if (actualStockDecremented.count !== 1) {
          throw new TransferHttpError(
            409,
            "Stok SKU aktual di cabang pengirim tidak mencukupi untuk mengesahkan koreksi.",
            "INSUFFICIENT_STOCK",
          );
        }
        await tx.productStock.upsert({
          where: {
            productId_branchId: { productId: current.productId, branchId: current.sourceBranchId },
          },
          update: { qty: { increment: current.dispatchedQty ?? 0 } },
          create: {
            productId: current.productId,
            branchId: current.sourceBranchId,
            qty: current.dispatchedQty ?? 0,
          },
        });
        await tx.adjustment.createMany({
          data: [
            {
              productId: current.productId,
              branchId: current.sourceBranchId,
              qty: current.dispatchedQty ?? 0,
              type: "TRANSFER_SKU_CORRECTION_RESTORE",
              reason: `Koreksi SKU transfer ${id}: pemulihan SKU yang salah dicatat`,
            },
            {
              productId: correction.actualProductId,
              branchId: current.sourceBranchId,
              qty: correction.actualQty,
              type: "TRANSFER_SKU_CORRECTION_OUT",
              reason: `Koreksi SKU transfer ${id}: SKU aktual dikirim`,
            },
          ],
        });

        const [expectedStock, actualStock] = await Promise.all([
          tx.productStock.findUnique({
            where: { productId_branchId: { productId: current.productId, branchId: current.sourceBranchId } },
            select: { qty: true },
          }),
          tx.productStock.findUnique({
            where: {
              productId_branchId: { productId: correction.actualProductId, branchId: current.sourceBranchId },
            },
            select: { qty: true },
          }),
        ]);
        const transfer = await tx.stockTransfer.findUniqueOrThrow({ where: { id }, include: transferInclude });
        return {
          transfer,
          sourceStockUpdates: [
            { productId: current.productId, qty: expectedStock?.qty ?? 0 },
            { productId: correction.actualProductId, qty: actualStock?.qty ?? 0 },
          ],
        };
      });
      for (const stock of result.sourceStockUpdates) {
        emitBranch(result.transfer.sourceBranchId, "stockUpdated", {
          productId: stock.productId,
          branchId: result.transfer.sourceBranchId,
          qty: stock.qty,
        });
      }
      emitTransferUpdate(
        emitBranch,
        result.transfer.sourceBranchId,
        result.transfer.targetBranchId,
        result.transfer.id,
        result.transfer.status,
      );
      res.json(result.transfer);
    } catch (error) {
      respondError(req, res, error, "Respons koreksi SKU gagal disimpan.");
    }
  });

  app.post(
    "/api/stock-transfers/:id/sku-corrections/:correctionId/receive",
    ...access,
    async (req: any, res): Promise<void> => {
      const actor = getActor(req);
      const id = typeof req.params.id === "string" ? req.params.id : "";
      const correctionId = typeof req.params.correctionId === "string" ? req.params.correctionId : "";
      if (!id || !correctionId) {
        res.status(400).json({ error: "ID transfer dan koreksi SKU wajib diisi." });
        return;
      }
      if (actor.role !== "CASHIER") {
        res.status(403).json({ error: "Penerimaan SKU aktual harus dikonfirmasi kasir cabang tujuan." });
        return;
      }
      try {
        const targetBranchId = requireCashierBranch(actor);
        const result = await prisma.$transaction(async (tx) => {
          await lockBranch(tx, targetBranchId);
          await requireOpenShift(tx, actor, targetBranchId);
          const correction = await tx.stockTransferSkuCorrection.findUnique({
            where: { id: correctionId },
            include: { transfer: true },
          });
          if (!correction || correction.transferId !== id) {
            throw new TransferHttpError(404, "Laporan koreksi SKU tidak ditemukan.");
          }
          const current = correction.transfer;
          if (current.targetBranchId !== targetBranchId) {
            throw new TransferHttpError(403, "Penerimaan ini bukan untuk cabang Anda.");
          }
          if (current.status !== "IN_TRANSIT" || correction.status !== "APPROVED_PENDING_RECEIPT") {
            throw new TransferHttpError(409, "Koreksi belum disetujui pengirim atau transfer sudah diterima.");
          }
          await assertProductCanBeTransferred(tx, correction.actualProductId, current.targetBranchId);
          const changedCorrection = await tx.stockTransferSkuCorrection.updateMany({
            where: { id: correctionId, status: "APPROVED_PENDING_RECEIPT" },
            data: {
              status: "RECEIVED",
              receivedById: actor.userId,
              receivedAt: new Date(),
            },
          });
          if (changedCorrection.count !== 1) {
            throw new TransferHttpError(409, "Penerimaan koreksi SKU sudah dicatat. Muat ulang daftar.");
          }
          await tx.productStock.upsert({
            where: {
              productId_branchId: { productId: correction.actualProductId, branchId: current.targetBranchId },
            },
            update: { qty: { increment: correction.actualQty } },
            create: {
              productId: correction.actualProductId,
              branchId: current.targetBranchId,
              qty: correction.actualQty,
            },
          });
          await tx.adjustment.create({
            data: {
              productId: correction.actualProductId,
              branchId: current.targetBranchId,
              qty: correction.actualQty,
              type: "TRANSFER_SKU_CORRECTION_IN",
              reason: `Koreksi SKU transfer ${id}: penerimaan SKU aktual`,
            },
          });
          const changedTransfer = await tx.stockTransfer.updateMany({
            where: { id, status: "IN_TRANSIT" },
            data: {
              status: "RECEIVED",
              receivedQty: correction.actualQty,
              receivedById: actor.userId,
              receivedAt: new Date(),
            },
          });
          if (changedTransfer.count !== 1) {
            throw new TransferHttpError(409, "Transfer sudah berubah. Muat ulang daftar.");
          }
          const targetStock = await tx.productStock.findUnique({
            where: {
              productId_branchId: { productId: correction.actualProductId, branchId: current.targetBranchId },
            },
            select: { qty: true },
          });
          const transfer = await tx.stockTransfer.findUniqueOrThrow({ where: { id }, include: transferInclude });
          return { transfer, targetQty: targetStock?.qty ?? 0, productId: correction.actualProductId };
        });
        emitBranch(result.transfer.targetBranchId, "stockUpdated", {
          productId: result.productId,
          branchId: result.transfer.targetBranchId,
          qty: result.targetQty,
        });
        emitTransferUpdate(
          emitBranch,
          result.transfer.sourceBranchId,
          result.transfer.targetBranchId,
          result.transfer.id,
          result.transfer.status,
        );
        res.json(result.transfer);
      } catch (error) {
        respondError(req, res, error, "Penerimaan SKU aktual gagal dicatat.");
      }
    },
  );

  app.post("/api/stock-transfers/:id/receive", ...access, async (req: any, res): Promise<void> => {
    const actor = getActor(req);
    const id = typeof req.params.id === "string" ? req.params.id : "";
    const receivedQty = nonnegativeInt(req.body?.receivedQty);
    let discrepancyNote: string | null;
    try {
      discrepancyNote = parseNote(req.body?.discrepancyNote, "Catatan selisih");
    } catch (error) {
      respondError(req, res, error, "Konfirmasi penerimaan gagal disimpan.");
      return;
    }
    if (!id || receivedQty === null) {
      res.status(400).json({ error: "ID transfer dan jumlah diterima (nol atau lebih) wajib diisi." });
      return;
    }
    if (actor.role !== "CASHIER") {
      res.status(403).json({ error: "Penerimaan harus dikonfirmasi oleh kasir cabang tujuan." });
      return;
    }
    try {
      const targetBranchId = requireCashierBranch(actor);
      const result = await prisma.$transaction(async (tx) => {
        await lockBranch(tx, targetBranchId);
        await requireOpenShift(tx, actor, targetBranchId);
        const current = await tx.stockTransfer.findUnique({ where: { id } });
        if (!current) throw new TransferHttpError(404, "Transfer tidak ditemukan.");
        if (current.targetBranchId !== targetBranchId) {
          throw new TransferHttpError(403, "Kasir hanya dapat mengonfirmasi penerimaan cabangnya sendiri.");
        }
        if (current.status !== "IN_TRANSIT" || !current.dispatchedQty) {
          throw new TransferHttpError(409, "Transfer belum dikirim atau sudah diterima.");
        }
        const priorSkuCorrection = await tx.stockTransferSkuCorrection.findFirst({
          where: { transferId: id },
          select: { id: true },
        });
        if (priorSkuCorrection) {
          throw new TransferHttpError(
            409,
            "Transfer ini memiliki laporan SKU salah. Selesaikan koreksi SKU sebelum menerima transfer.",
          );
        }
        if (receivedQty > current.dispatchedQty) {
          throw new TransferHttpError(400, "Jumlah diterima tidak boleh melebihi jumlah yang dikirim.");
        }
        if (receivedQty !== current.dispatchedQty && !discrepancyNote) {
          throw new TransferHttpError(400, "Catatan selisih wajib diisi jika jumlah diterima berbeda.");
        }
        const changed = await tx.stockTransfer.updateMany({
          where: { id, status: "IN_TRANSIT" },
          data: {
            status: "RECEIVED",
            receivedQty,
            receivedById: actor.userId,
            receivedAt: new Date(),
            discrepancyNote,
          },
        });
        if (changed.count !== 1) throw new TransferHttpError(409, "Transfer sudah berubah. Muat ulang daftar.");
        let targetStock = await tx.productStock.findUnique({
          where: { productId_branchId: { productId: current.productId, branchId: targetBranchId } },
          select: { qty: true },
        });
        if (receivedQty > 0) {
          targetStock = await tx.productStock.upsert({
            where: { productId_branchId: { productId: current.productId, branchId: targetBranchId } },
            update: { qty: { increment: receivedQty } },
            create: { productId: current.productId, branchId: targetBranchId, qty: receivedQty },
            select: { qty: true },
          });
          await tx.adjustment.create({
            data: {
              productId: current.productId,
              branchId: targetBranchId,
              qty: receivedQty,
              type: "TRANSFER_IN",
              reason: `Transfer ${id} diterima dari cabang sumber`,
            },
          });
        }
        const transfer = await tx.stockTransfer.findUniqueOrThrow({ where: { id }, include: transferInclude });
        return { transfer, targetQty: targetStock?.qty ?? 0 };
      });
      emitBranch(targetBranchId, "stockUpdated", {
        productId: result.transfer.productId,
        branchId: targetBranchId,
        qty: result.targetQty,
      });
      emitTransferUpdate(
        emitBranch,
        result.transfer.sourceBranchId,
        result.transfer.targetBranchId,
        result.transfer.id,
        result.transfer.status,
      );
      res.json(result.transfer);
    } catch (error) {
      respondError(req, res, error, "Konfirmasi penerimaan gagal disimpan.");
    }
  });

  app.patch("/api/stock-transfers/:id/cancel", ...access, async (req: any, res): Promise<void> => {
    const actor = getActor(req);
    const id = typeof req.params.id === "string" ? req.params.id : "";
    let note: string | null;
    try {
      note = parseNote(req.body?.note, "Alasan pembatalan");
    } catch (error) {
      respondError(req, res, error, "Pembatalan transfer gagal disimpan.");
      return;
    }
    if (!id) {
      res.status(400).json({ error: "ID transfer tidak valid." });
      return;
    }
    try {
      const result = await prisma.$transaction(async (tx) => {
        const current = await tx.stockTransfer.findUnique({ where: { id } });
        if (!current) throw new TransferHttpError(404, "Transfer tidak ditemukan.");
        if (!["REQUESTED", "ACCEPTED"].includes(current.status) || current.kind !== "REQUEST") {
          throw new TransferHttpError(409, "Transfer yang sudah dikirim tidak dapat dibatalkan dari sini.");
        }
        if (actor.role === "CASHIER" && current.targetBranchId !== actor.branchId) {
          throw new TransferHttpError(403, "Hanya cabang peminta yang dapat membatalkan permintaan.");
        }
        const branchId = actor.role === "CASHIER" ? current.targetBranchId : current.sourceBranchId;
        await lockBranch(tx, branchId);
        await requireOpenShift(tx, actor, branchId);
        const changed = await tx.stockTransfer.updateMany({
          where: { id, status: current.status, kind: "REQUEST" },
          data: {
            status: "CANCELLED",
            closedById: actor.userId,
            closedAt: new Date(),
            responseNote: note,
          },
        });
        if (changed.count !== 1) throw new TransferHttpError(409, "Transfer sudah berubah. Muat ulang daftar.");
        return tx.stockTransfer.findUniqueOrThrow({ where: { id }, include: transferInclude });
      });
      emitTransferUpdate(emitBranch, result.sourceBranchId, result.targetBranchId, result.id, result.status);
      res.json(result);
    } catch (error) {
      respondError(req, res, error, "Pembatalan transfer gagal disimpan.");
    }
  });
}
