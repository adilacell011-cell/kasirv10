import type { PrismaClient } from "@prisma/client";
import type { Application, RequestHandler } from "express";
import { randomUUID } from "node:crypto";
import {
  emitTransferUpdate,
  getActor,
  lockTransferBranches,
  nonnegativeInt,
  parseNote,
  positiveInt,
  requireCashierBranch,
  requireOpenShift,
  respondError,
  transferInclude,
  TransferHttpError,
  type TransferActor,
} from "./stock-transfers";

type EmitBranch = (branchId: string | null | undefined, event: string, payload: any) => void;
type ReturnInput = { transferId: string; qty: number };
type ReturnReceiptInput = { transferId: string; receivedQty: number; discrepancyNote: string | null };

function isScopedTransferManager(actor: TransferActor) {
  return actor.role === "ADMIN" || actor.role === "AUDIT";
}

export function registerStockTransferReturnRoutes(
  app: Application,
  prisma: PrismaClient,
  authenticateToken: RequestHandler,
  requireRole: (...roles: string[]) => RequestHandler,
  emitBranch: EmitBranch,
): void {
  const access = [authenticateToken, requireRole("ADMIN", "AUDIT", "CASHIER")];

  app.post("/api/stock-transfers/returns", ...access, async (req: any, res): Promise<void> => {
    const actor = getActor(req);
    const body = req.body ?? {};
    if (!Array.isArray(body.items) || body.items.length < 1 || body.items.length > 50) {
      res.status(400).json({ error: "Pilih 1–50 produk dari kiriman yang sudah diterima." });
      return;
    }

    let items: ReturnInput[];
    let note: string | null;
    try {
      items = body.items.map((item: any) => {
        if (typeof item?.transferId !== "string" || !item.transferId.trim() || item.transferId.length > 128) {
          throw new TransferHttpError(400, "Referensi kiriman retur tidak valid.");
        }
        const qty = positiveInt(item.qty);
        if (qty === null) throw new TransferHttpError(400, "Jumlah retur harus bilangan bulat lebih dari nol.");
        return { transferId: item.transferId.trim(), qty };
      });
      note = parseNote(body.note, "Catatan retur");
    } catch (error) {
      respondError(req, res, error, "Data retur tidak valid.");
      return;
    }
    if (new Set(items.map((item) => item.transferId)).size !== items.length) {
      res.status(400).json({ error: "Produk yang sama tidak boleh tercatat dua kali dalam satu retur." });
      return;
    }

    try {
      const requestedIds = items.map((item) => item.transferId);
      const initialRows = await prisma.stockTransfer.findMany({
        where: { id: { in: requestedIds } },
        select: { id: true, sourceBranchId: true, targetBranchId: true },
      });
      if (initialRows.length !== requestedIds.length) {
        throw new TransferHttpError(404, "Satu atau lebih kiriman asal tidak ditemukan.");
      }
      const originalSourceBranchId = initialRows[0]!.sourceBranchId;
      const returnSenderBranchId = initialRows[0]!.targetBranchId;
      if (initialRows.some((row) =>
        row.sourceBranchId !== originalSourceBranchId || row.targetBranchId !== returnSenderBranchId
      )) {
        throw new TransferHttpError(400, "Satu retur hanya boleh berisi produk dari jalur cabang yang sama.");
      }
      if (!isScopedTransferManager(actor) && actor.role === "CASHIER" &&
          requireCashierBranch(actor) !== returnSenderBranchId) {
        throw new TransferHttpError(403, "Retur hanya dapat dibuat oleh cabang yang menerima kiriman asal.");
      }

      const created = await prisma.$transaction(async (tx) => {
        await lockTransferBranches(tx, returnSenderBranchId, originalSourceBranchId);
        await requireOpenShift(tx, actor, returnSenderBranchId);

        const originals = await tx.stockTransfer.findMany({
          where: { id: { in: requestedIds } },
          include: transferInclude,
        });
        if (originals.length !== requestedIds.length) {
          throw new TransferHttpError(404, "Satu atau lebih kiriman asal tidak ditemukan.");
        }
        const originalById = new Map(originals.map((row) => [row.id, row]));
        const prepared = items.map((item) => {
          const original = originalById.get(item.transferId);
          if (!original || original.kind === "RETURN") {
            throw new TransferHttpError(409, "Retur harus merujuk ke produk kiriman asal.");
          }
          if (original.sourceBranchId !== originalSourceBranchId ||
              original.targetBranchId !== returnSenderBranchId) {
            throw new TransferHttpError(400, "Satu retur hanya boleh berisi produk dari jalur cabang yang sama.");
          }
          if (original.status === "IN_TRANSIT") {
            if (!original.dispatchedQty || item.qty !== original.dispatchedQty) {
              throw new TransferHttpError(
                400,
                `${original.product.name}: penolakan SKU harus mengembalikan seluruh ${original.dispatchedQty ?? 0} pcs dalam baris ini.`,
                "RETURN_FULL_LINE_REQUIRED",
              );
            }
            return {
              ...item,
              original,
              rejection: true,
              productId: original.productId,
              productName: original.product.name,
              receivedQty: original.dispatchedQty,
            };
          }
          if (original.status !== "RECEIVED" || original.receivedQty === null) {
            throw new TransferHttpError(409, "Retur stok hanya dapat dibuat dari kiriman berjalan atau yang sudah diterima.");
          }
          const acceptedCorrection = original.skuCorrections.find((correction) => correction.status === "RECEIVED");
          return {
            ...item,
            original,
            rejection: false,
            productId: acceptedCorrection?.actualProductId ?? original.productId,
            productName: acceptedCorrection?.actualProduct.name ?? original.product.name,
            receivedQty: acceptedCorrection?.actualQty ?? original.receivedQty,
          };
        });
        const returnedTotals = await tx.stockTransfer.groupBy({
          by: ["returnOfId"],
          where: {
            kind: "RETURN",
            returnOfId: { in: requestedIds },
            status: { in: ["IN_TRANSIT", "RECEIVED"] },
          },
          _sum: { dispatchedQty: true },
        });
        const returnedQtyByOriginal = new Map(
          returnedTotals
            .filter((row) => row.returnOfId)
            .map((row) => [row.returnOfId!, row._sum.dispatchedQty ?? 0]),
        );

        for (const item of prepared) {
          const alreadyReturned = returnedQtyByOriginal.get(item.transferId) ?? 0;
          if (item.rejection) {
            if (alreadyReturned > 0) {
              throw new TransferHttpError(409, `${item.productName}: baris kiriman ini sudah memiliki proses retur.`);
            }
            continue;
          }
          const availableQty = Math.max(0, item.receivedQty - alreadyReturned);
          if (item.qty > availableQty) {
            throw new TransferHttpError(
              409,
              `${item.productName}: jumlah retur melebihi jumlah yang masih dapat dikembalikan (${availableQty} pcs).`,
              "RETURN_QTY_EXCEEDED",
            );
          }
        }

        const batchId = randomUUID();
        const returned = [];
        const updatedOriginals = [];
        for (const item of prepared) {
          if (item.rejection) {
            const changedOriginal = await tx.stockTransfer.updateMany({
              where: { id: item.transferId, kind: { not: "RETURN" }, status: "IN_TRANSIT" },
              data: { status: "RETURN_PENDING" },
            });
            if (changedOriginal.count !== 1) {
              throw new TransferHttpError(409, `${item.productName}: kiriman sudah berubah. Muat ulang.`);
            }
            await tx.stockTransferSkuCorrection.updateMany({
              where: {
                transferId: item.transferId,
                status: { in: ["PENDING_SOURCE", "APPROVED_PENDING_RECEIPT"] },
              },
              data: {
                status: "SUPERSEDED_BY_RETURN",
                responseNote: "Baris penuh dikembalikan; revisi SKU tidak dilanjutkan.",
              },
            });
            updatedOriginals.push(await tx.stockTransfer.findUniqueOrThrow({
              where: { id: item.transferId },
              include: transferInclude,
            }));
          } else {
            const decremented = await tx.productStock.updateMany({
              where: {
                productId: item.productId,
                branchId: returnSenderBranchId,
                qty: { gte: item.qty },
              },
              data: { qty: { decrement: item.qty } },
            });
            if (decremented.count !== 1) {
              throw new TransferHttpError(
                409,
                `${item.productName}: stok cabang pengirim retur tidak cukup. Tidak ada retur yang dikirim.`,
                "INSUFFICIENT_STOCK",
              );
            }
          }

          const transfer = await tx.stockTransfer.create({
            data: {
              batchId,
              returnOfId: item.transferId,
              productId: item.productId,
              sourceBranchId: returnSenderBranchId,
              targetBranchId: originalSourceBranchId,
              kind: "RETURN",
              status: "IN_TRANSIT",
              requestedQty: item.qty,
              approvedQty: item.qty,
              dispatchedQty: item.qty,
              requestNote: note,
              requestedById: actor.userId,
              dispatchedById: actor.userId,
              dispatchedAt: new Date(),
            },
            include: transferInclude,
          });
          if (!item.rejection) {
            await tx.adjustment.create({
              data: {
                productId: item.productId,
                branchId: returnSenderBranchId,
                qty: item.qty,
                type: "TRANSFER_RETURN_OUT",
                reason: `Retur ${transfer.id} dari transfer ${item.transferId} dikirim ke ${transfer.targetBranch.name}`,
              },
            });
          }
          returned.push(transfer);
        }
        return { batchId, items: returned, updatedOriginals };
      });

      for (const transfer of created.items) {
        emitTransferUpdate(emitBranch, transfer.sourceBranchId, transfer.targetBranchId, transfer.id, transfer.status);
      }
      for (const transfer of created.updatedOriginals) {
        emitTransferUpdate(emitBranch, transfer.sourceBranchId, transfer.targetBranchId, transfer.id, transfer.status);
      }
      res.status(201).json({ batchId: created.batchId, items: created.items });
    } catch (error) {
      respondError(req, res, error, "Retur stok gagal dikirim.");
    }
  });

  app.post(
    "/api/stock-transfers/returns/:batchId/receive",
    ...access,
    async (req: any, res): Promise<void> => {
      const actor = getActor(req);
      const batchId = typeof req.params.batchId === "string" ? req.params.batchId : "";
      const body = req.body ?? {};
      if (!batchId || batchId.length > 128) {
        res.status(400).json({ error: "Identitas retur tidak valid." });
        return;
      }
      if (!Array.isArray(body.items) || body.items.length < 1 || body.items.length > 50) {
        res.status(400).json({ error: "Data konfirmasi retur tidak valid." });
        return;
      }

      let receipts: ReturnReceiptInput[];
      try {
        receipts = body.items.map((item: any) => {
          if (typeof item?.transferId !== "string" || !item.transferId.trim() || item.transferId.length > 128) {
            throw new TransferHttpError(400, "Produk retur tidak valid.");
          }
          const receivedQty = nonnegativeInt(item.receivedQty);
          if (receivedQty === null) {
            throw new TransferHttpError(400, "Jumlah diterima harus bilangan bulat nol atau lebih.");
          }
          return {
            transferId: item.transferId.trim(),
            receivedQty,
            discrepancyNote: parseNote(item.discrepancyNote, "Catatan selisih retur"),
          };
        });
      } catch (error) {
        respondError(req, res, error, "Data konfirmasi retur tidak valid.");
        return;
      }
      if (new Set(receipts.map((item) => item.transferId)).size !== receipts.length) {
        res.status(400).json({ error: "Produk retur tidak boleh diulang dalam satu konfirmasi." });
        return;
      }

      try {
        const initialRows = await prisma.stockTransfer.findMany({
          where: { batchId, kind: "RETURN" },
          select: { id: true, sourceBranchId: true, targetBranchId: true },
        });
        if (!initialRows.length) throw new TransferHttpError(404, "Kiriman retur tidak ditemukan.");
        if (initialRows.length !== receipts.length ||
            initialRows.some((row) => !receipts.some((receipt) => receipt.transferId === row.id))) {
          throw new TransferHttpError(400, "Konfirmasi harus mencakup seluruh produk dalam kiriman retur.");
        }
        const returnSenderBranchId = initialRows[0]!.sourceBranchId;
        const originalSourceBranchId = initialRows[0]!.targetBranchId;
        if (initialRows.some((row) =>
          row.sourceBranchId !== returnSenderBranchId || row.targetBranchId !== originalSourceBranchId
        )) {
          throw new TransferHttpError(409, "Kiriman retur memiliki cabang tujuan yang tidak konsisten.");
        }
        if (actor.role === "CASHIER" && requireCashierBranch(actor) !== originalSourceBranchId) {
          throw new TransferHttpError(403, "Hanya cabang asal kiriman yang dapat mengonfirmasi retur.");
        }

        const received = await prisma.$transaction(async (tx) => {
          await lockTransferBranches(tx, returnSenderBranchId, originalSourceBranchId);
          await requireOpenShift(tx, actor, originalSourceBranchId);
          const rows = await tx.stockTransfer.findMany({
            where: { batchId, kind: "RETURN" },
            include: transferInclude,
          });
          if (rows.length !== receipts.length ||
              rows.some((row) => !receipts.some((receipt) => receipt.transferId === row.id))) {
            throw new TransferHttpError(409, "Kiriman retur berubah. Muat ulang sebelum mengonfirmasi.");
          }
          const receiptById = new Map(receipts.map((receipt) => [receipt.transferId, receipt]));
          for (const row of rows) {
            const receipt = receiptById.get(row.id)!;
            const original = row.returnOf;
            if (row.status !== "IN_TRANSIT" || row.dispatchedQty === null || !row.returnOfId || !original) {
              throw new TransferHttpError(409, "Kiriman retur sudah diproses atau tidak valid.");
            }
            if (receipt.receivedQty > row.dispatchedQty) {
              throw new TransferHttpError(400, "Jumlah diterima tidak boleh melebihi jumlah yang dikirim.");
            }
            if (original.status === "RETURN_PENDING") {
              if (original.dispatchedQty === null ||
                  row.dispatchedQty !== original.dispatchedQty ||
                  receipt.receivedQty !== row.dispatchedQty) {
                throw new TransferHttpError(
                  400,
                  `${row.product.name}: retur SKU salah harus diterima utuh (${row.dispatchedQty} pcs).`,
                  "RETURN_FULL_LINE_REQUIRED",
                );
              }
            } else if (original.status !== "RECEIVED") {
              throw new TransferHttpError(409, "Transfer asal tidak lagi menunggu retur fisik.");
            }
          }

          const updatedRows = [];
          for (const row of rows) {
            const receipt = receiptById.get(row.id)!;
            const original = row.returnOf!;
            const rejectedBeforeReceipt = original.status === "RETURN_PENDING";
            const updatedCount = await tx.stockTransfer.updateMany({
              where: { id: row.id, batchId, kind: "RETURN", status: "IN_TRANSIT" },
              data: {
                status: "RECEIVED",
                receivedQty: receipt.receivedQty,
                discrepancyNote: receipt.discrepancyNote,
                receivedById: actor.userId,
                receivedAt: new Date(),
              },
            });
            if (updatedCount.count !== 1) {
              throw new TransferHttpError(409, "Kiriman retur sudah dikonfirmasi oleh pengguna lain.");
            }
            if (rejectedBeforeReceipt) {
              const closedOriginal = await tx.stockTransfer.updateMany({
                where: { id: original.id, status: "RETURN_PENDING" },
                data: {
                  status: "RETURNED",
                  closedById: actor.userId,
                  closedAt: new Date(),
                },
              });
              if (closedOriginal.count !== 1) {
                throw new TransferHttpError(409, "Kiriman asal sudah berubah. Muat ulang sebelum mengonfirmasi retur.");
              }
            }
            const creditedProductId = rejectedBeforeReceipt ? original.productId : row.productId;
            const creditedQty = rejectedBeforeReceipt ? original.dispatchedQty! : receipt.receivedQty;
            let targetQty: number | null = null;
            if (creditedQty > 0) {
              const targetStock = await tx.productStock.upsert({
                where: {
                  productId_branchId: {
                    productId: creditedProductId,
                    branchId: row.targetBranchId,
                  },
                },
                update: { qty: { increment: creditedQty } },
                create: {
                  productId: creditedProductId,
                  branchId: row.targetBranchId,
                  qty: creditedQty,
                },
                select: { qty: true },
              });
              targetQty = targetStock.qty;
              await tx.adjustment.create({
                data: {
                  productId: creditedProductId,
                  branchId: row.targetBranchId,
                  qty: creditedQty,
                  type: "TRANSFER_RETURN_IN",
                  reason: rejectedBeforeReceipt
                    ? `SKU salah pada transfer ${row.returnOfId} dikembalikan utuh melalui retur ${row.id}`
                    : `Retur ${row.id} dari transfer ${row.returnOfId} diterima dari ${row.sourceBranch.name}`,
                },
              });
            }
            const updated = await tx.stockTransfer.findUniqueOrThrow({
              where: { id: row.id },
              include: transferInclude,
            });
            const updatedOriginal = rejectedBeforeReceipt
              ? await tx.stockTransfer.findUniqueOrThrow({
                  where: { id: original.id },
                  include: transferInclude,
                })
              : null;
            updatedRows.push({ row: updated, targetQty, creditedProductId, updatedOriginal });
          }
          return updatedRows;
        });

        for (const item of received) {
          if (item.targetQty !== null) {
            emitBranch(item.row.targetBranchId, "stockUpdated", {
              productId: item.creditedProductId,
              branchId: item.row.targetBranchId,
              qty: item.targetQty,
            });
          }
          emitTransferUpdate(
            emitBranch,
            item.row.sourceBranchId,
            item.row.targetBranchId,
            item.row.id,
            item.row.status,
          );
          if (item.updatedOriginal) {
            emitTransferUpdate(
              emitBranch,
              item.updatedOriginal.sourceBranchId,
              item.updatedOriginal.targetBranchId,
              item.updatedOriginal.id,
              item.updatedOriginal.status,
            );
          }
        }
        res.json({ batchId, items: received.map((item) => item.row) });
      } catch (error) {
        respondError(req, res, error, "Konfirmasi retur gagal.");
      }
    },
  );
}
