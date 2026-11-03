import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { PrismaClient, type Prisma } from "@prisma/client";
import { validateDatabaseTarget } from "./database-target";
import { inspectDatabase } from "./database-readiness";
import { closeShiftSafely, openShiftSafely } from "./shift-safety";
import { getLogicalShiftDate } from "./business-date";

test("PostgreSQL rolls back shift closing when summary storage fails", {
  skip: process.env.RUN_SHIFT_DB_TESTS !== "1",
}, async () => {
  const target = validateDatabaseTarget(process.env);
  assert.equal(target.environment, "development");
  const prisma = new PrismaClient();
  try {
    await inspectDatabase(prisma, target);
    const tag = `QA-SHIFT-ROLLBACK-${randomUUID()}`;
    const branch = await prisma.branch.create({ data: { name: tag } });
    const user = await prisma.user.create({
      data: { username: tag, password: "QA-no-login", name: "QA Rollback", branchId: branch.id, role: "CASHIER" },
    });
    const shift = await openShiftSafely(prisma, {
      branchId: branch.id, cashierId: user.id, initialCash: 0,
      shiftDate: getLogicalShiftDate(), shiftType: "Pagi - QA Rollback",
    });
    // Inject an application error, but execute rollback against REAL PostgreSQL.
    const failing = {
      $transaction: <T>(work: (tx: Prisma.TransactionClient) => Promise<T>) =>
        prisma.$transaction(tx => work(new Proxy(tx, {
          get(object, key) {
            if (key === "dailyIncomeSummary") return { upsert: async () => { throw new Error("QA-summary-failure"); } };
            return Reflect.get(object, key);
          },
        }))),
    } as unknown as PrismaClient;
    await assert.rejects(() => closeShiftSafely(failing, shift.id, branch.id, 0), /QA-summary-failure/);
    const unchanged = await prisma.shift.findUniqueOrThrow({ where: { id: shift.id } });
    assert.equal(unchanged.status, "open");
    assert.equal(unchanged.closeTime, null);
    assert.equal(await prisma.dailyIncomeSummary.count({ where: { branchId: branch.id } }), 0);
    const retried = await closeShiftSafely(prisma, shift.id, branch.id, 0);
    assert.equal(retried.status, "closed");
    assert.equal(await prisma.dailyIncomeSummary.count({ where: { branchId: branch.id } }), 1);
    assert.deepEqual(await closeShiftSafely(prisma, shift.id, branch.id, 999), retried);
    console.info("Retained QA rollback fixture:", tag);
  } finally {
    await prisma.$disconnect();
  }
});
