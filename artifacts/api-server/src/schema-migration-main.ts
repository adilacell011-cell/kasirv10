import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Prisma, PrismaClient } from "@prisma/client";
import { inspectDatabase } from "./database-readiness";
import { validateDatabaseTarget } from "./database-target";
import { approveStagingSchemaMigration } from "./schema-migration";

const BASELINE_MIGRATION = "20261106110000_baseline_existing_15_table_schema";
const AUDIT_MIGRATION = "20261106120000_add_branch_stock_audit_tables";
const LEGACY_MODEL_NAMES = new Set([
  "User", "Branch", "Product", "ProductStock", "VoucherSN", "Sale",
  "SaleIdempotency", "SaleItem", "Commission", "Adjustment", "GlobalConfig",
  "Shift", "StockSnapshot", "DailyIncomeSummary", "ShoppingPlan",
]);

function safePrismaDiagnostic(error: unknown): string {
  if (!error || typeof error !== "object") return "";
  const stderr = "stderr" in error ? error.stderr : undefined;
  const stdout = "stdout" in error ? error.stdout : undefined;
  const raw = [stderr, stdout]
    .map((value) => Buffer.isBuffer(value) ? value.toString("utf8") : typeof value === "string" ? value : "")
    .filter(Boolean)
    .join("\n")
    .trim();
  if (!raw) return "";
  const configuredUrl = process.env.DATABASE_URL;
  return raw
    .replaceAll(configuredUrl ?? "\u0000", "[redacted DATABASE_URL]")
    .replace(/postgres(?:ql)?:\/\/[^\s'"]+/gi, "[redacted database URL]")
    .slice(-4000);
}

async function main() {
  const target = validateDatabaseTarget(process.env);
  approveStagingSchemaMigration(process.argv.slice(2), target, process.env);

  const require = createRequire(import.meta.url);
  const prismaCli = require.resolve("prisma/build/index.js");
  const packageDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const schemaPath = path.join(packageDir, "prisma/schema.prisma");

  const client = new PrismaClient();
  try {
    const targetState = await client.$queryRaw<Array<{
      currentDatabase: string;
      hasMigrationTable: boolean;
      hasAuditTable: boolean;
      hasAuditItemTable: boolean;
    }>>`
      SELECT current_database() AS "currentDatabase",
        to_regclass('public."_prisma_migrations"') IS NOT NULL AS "hasMigrationTable",
        to_regclass('public."BranchStockAudit"') IS NOT NULL AS "hasAuditTable",
        to_regclass('public."BranchStockAuditItem"') IS NOT NULL AS "hasAuditItemTable"
    `;
    if (targetState[0]?.currentDatabase !== target.database) {
      throw new Error("Connected database does not match the validated target.");
    }

    let migrationRows: Array<{
      migration_name: string;
      finished_at: Date | null;
      rolled_back_at: Date | null;
    }> = [];
    if (targetState[0].hasMigrationTable) {
      migrationRows = await client.$queryRaw<Array<{
        migration_name: string;
        finished_at: Date | null;
        rolled_back_at: Date | null;
      }>>`
        SELECT migration_name, finished_at, rolled_back_at
          FROM public."_prisma_migrations"
      `;
    }
    const unknownMigrations = migrationRows.filter(
      (row) => row.migration_name !== BASELINE_MIGRATION && row.migration_name !== AUDIT_MIGRATION,
    );
    if (unknownMigrations.length > 0) {
      throw new Error("Existing Prisma migration history contains unapproved migrations; refusing to continue.");
    }
    const baseline = migrationRows.find((row) => row.migration_name === BASELINE_MIGRATION);
    const additive = migrationRows.find((row) => row.migration_name === AUDIT_MIGRATION);

    if (additive?.finished_at && !additive.rolled_back_at) {
      await inspectDatabase(client, target);
      console.log("Audit Stok migration is already applied and the current schema is compatible. No DDL performed.");
      return;
    }
    if (additive && (!additive.finished_at || additive.rolled_back_at)) {
      throw new Error("An incomplete or rolled-back Audit Stok migration requires manual inspection.");
    }
    if (targetState[0].hasMigrationTable && !baseline && migrationRows.length > 0) {
      throw new Error("Existing Prisma migration history is not the approved legacy baseline.");
    }
    if (baseline && (!baseline.finished_at || baseline.rolled_back_at)) {
      throw new Error("The legacy Prisma baseline is incomplete or rolled back.");
    }
    if (targetState[0].hasAuditTable || targetState[0].hasAuditItemTable) {
      throw new Error("Audit Stok tables already exist without a completed migration record; refusing to infer or alter schema.");
    }

    const legacyModels = Prisma.dmmf.datamodel.models.filter((model) => LEGACY_MODEL_NAMES.has(model.name));
    if (legacyModels.length !== LEGACY_MODEL_NAMES.size) {
      throw new Error("The application Prisma datamodel no longer matches the approved 15-table legacy baseline.");
    }
    // Validate all legacy columns, nullability, unique keys and foreign-key
    // actions before recording the baseline or applying any DDL.
    await inspectDatabase(client, target, legacyModels);

    if (!baseline) {
      const baselineOutput = execFileSync(process.execPath, [
        prismaCli, "migrate", "resolve", "--applied", BASELINE_MIGRATION,
        "--schema", schemaPath,
      ], {
        cwd: packageDir,
        env: process.env,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
        timeout: 10 * 60 * 1000,
      });
      printSafeOutput(baselineOutput);
    }

    const output = execFileSync(process.execPath, [
      prismaCli, "migrate", "deploy", "--schema", schemaPath,
    ], {
      cwd: packageDir,
      env: process.env,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      timeout: 10 * 60 * 1000,
    });
    printSafeOutput(output);
    await inspectDatabase(client, target);
    console.log("Schema migration and read-only compatibility check completed.");
  } catch (error) {
    console.error(
      "Prisma schema migration failed. No retry was attempted; verify the approved staging/QA target and migration state.",
    );
    const diagnostic = safePrismaDiagnostic(error);
    if (diagnostic) console.error(diagnostic);
    process.exitCode = 1;
  } finally {
    await client.$disconnect();
  }
}

function printSafeOutput(output: string): void {
  const connectionString = process.env.DATABASE_URL;
  console.log(connectionString ? output.replaceAll(connectionString, "[redacted DATABASE_URL]") : output);
}

void main().catch(() => {
  console.error(
    "Prisma schema migration refused. Verify the explicit database target and target-specific approval.",
  );
  process.exitCode = 1;
});
