import type { Prisma, PrismaClient } from "@prisma/client";
import { getLogicalShiftDate } from "./business-date";

export class ShiftConflict extends Error {
  readonly status = 409;
}

// Transaction-scoped, shared across API processes; no schema changes.
export async function lockBranch(tx: Prisma.TransactionClient, branchId: string) {
  await tx.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(hashtextextended(${`alfath-shift:${branchId}`}, 0))`;
}

type OpenInput = {
  branchId: string; cashierId: string; initialCash: number;
  shiftDate: string; shiftType: string;
};

export function openShiftSafely(prisma: PrismaClient, input: OpenInput) {
  return prisma.$transaction(async (tx) => {
    await lockBranch(tx, input.branchId);
    const open = await tx.shift.findMany({ where: { branchId: input.branchId, status: "open" } });
    if (open.length) {
      const same = open.length === 1 && open[0].cashierId === input.cashierId &&
        open[0].shiftType === input.shiftType && open[0].shiftDate === input.shiftDate;
      if (same) return open[0]; // Recover an opening whose response was lost.
      throw new ShiftConflict("Cabang masih memiliki shift aktif. Muat ulang dan selesaikan shift tersebut dahulu.");
    }
    return tx.shift.create({ data: { ...input, status: "open", totalSales: 0 } });
  });
}

export function closeShiftSafely(prisma: PrismaClient, id: string, branchId: string, actualCash?: number) {
  return prisma.$transaction(async (tx) => {
    await lockBranch(tx, branchId);
    const shift = await tx.shift.findUnique({ where: { id } });
    if (!shift || shift.branchId !== branchId) throw new ShiftConflict("Shift tidak ditemukan pada cabang ini.");
    // Never recalculate an already closed snapshot, even after another shift opens.
    if (shift.status === "closed") return shift;
    if (shift.status !== "open") throw new ShiftConflict("Status shift tidak dapat ditutup.");
    const closeTime = new Date();
    const aggregate = await tx.sale.aggregate({
      where: { branchId, status: "success", createdAt: { gte: shift.openTime, lte: closeTime } },
      _sum: { total: true },
    });
    const totalSales = Number(aggregate._sum.total ?? 0);
    const closed = await tx.shift.update({
      where: { id },
      data: {
        status: "closed", closeTime, totalSales,
        ...(actualCash === undefined ? {} : {
          actualCash, difference: actualCash - (Number(shift.initialCash) + totalSales),
        }),
      },
    });

    // Same existing daily formula and 06:00 WIB boundaries; now atomic with closing.
    const date = getLogicalShiftDate(shift.openTime);
    const [y, m, d] = date.split("-").map(Number);
    const day = await tx.sale.aggregate({
      where: {
        branchId, status: "success",
        createdAt: {
          gte: new Date(Date.UTC(y, m - 1, d - 1, 23)),
          lt: new Date(Date.UTC(y, m - 1, d, 23)),
        },
      },
      _sum: { total: true, totalProfit: true, totalCommission: true },
      _count: { id: true },
    });
    const values = {
      revenue: Number(day._sum.total ?? 0), totalProfit: Number(day._sum.totalProfit ?? 0),
      totalCommission: Number(day._sum.totalCommission ?? 0), salesCount: day._count.id,
    };
    await tx.dailyIncomeSummary.upsert({
      where: { branchId_date: { branchId, date } },
      create: { branchId, date, ...values }, update: values,
    });
    return closed;
  });
}
