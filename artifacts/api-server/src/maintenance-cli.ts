import { PrismaClient } from "@prisma/client";
import { validateDatabaseTarget, type DatabaseTarget } from "./database-target";
import { inspectDatabase } from "./database-readiness";

const operations = ["bootstrap-owner", "seed", "backfill", "archive"] as const;
type Operation = typeof operations[number];

export function approveMaintenance(args: string[], target: DatabaseTarget): Operation {
  const operation = args[0] as Operation;
  const approval = `--approve=${operation}:${target.environment}:${target.host}:${target.port}/${target.database}/${target.schema}`;
  if (!operations.includes(operation) || !args.includes("--execute") ||
      !args.includes("--acknowledge-legacy-risks") || !args.includes(approval)) {
    throw new Error("Maintenance blocked. Explicit operation, --execute, target-specific --approve and --acknowledge-legacy-risks are required. See STARTUP-SAFETY.md.");
  }
  return operation;
}

export async function runMaintenance(args = process.argv.slice(2)) {
  const target = validateDatabaseTarget(process.env);
  // Permission is checked before creating a client or importing write operations.
  const operation = approveMaintenance(args, target);
  const prisma = new PrismaClient();
  try {
    await prisma.$connect();
    await inspectDatabase(prisma, target);
    // Keep both the lock and every write on the SAME pinned transaction:
    // timeout/failure cannot release the lock while writes continue elsewhere.
    await prisma.$transaction(async tx => {
      const rows = await tx.$queryRaw<{ locked: boolean }[]>`
        SELECT pg_try_advisory_xact_lock(180043211, 1) AS locked`;
      if (!rows[0]?.locked) throw new Error("Another administrative maintenance operation is active.");
      const {
        autoArchiveOldSales,
        backfillDailySummaries,
        bootstrapOwner,
        syncCredentials,
      } = await import("./maintenance-operations");
      if (operation === "bootstrap-owner") await bootstrapOwner(tx);
      if (operation === "seed") await syncCredentials(tx);
      if (operation === "backfill") await backfillDailySummaries(tx);
      if (operation === "archive") await autoArchiveOldSales(prisma, tx);
    }, { timeout: 600_000, maxWait: 5000 });
  } finally { await prisma.$disconnect(); }
}
