import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Prisma, PrismaClient } from "@prisma/client";
import {
  assertCompatibleSchema,
  assertExactModelTablesAndColumns,
  readDatabaseSnapshot,
} from "./database-readiness";
import { validateDatabaseTarget } from "./database-target";
import { approveStagingSchemaMigration } from "./schema-migration";

const BASELINE_MIGRATION = "20261106110000_baseline_existing_15_table_schema";
const AUDIT_MIGRATION = "20261106120000_add_branch_stock_audit_tables";
const LEGACY14_MIGRATION = "20261106105000_upgrade_legacy14_sale_idempotency";
const VERIFIED_LEGACY_BASELINE_MIGRATION = "20261106104000_baseline_verified_legacy_schema";
const LEGACY14_MODEL_NAMES = new Set([
  "User", "Branch", "Product", "ProductStock", "VoucherSN", "Sale", "SaleItem",
  "Commission", "Adjustment", "GlobalConfig", "Shift", "StockSnapshot",
  "DailyIncomeSummary", "ShoppingPlan",
]);
const LEGACY_MODEL_NAMES = new Set([
  "User", "Branch", "Product", "ProductStock", "VoucherSN", "Sale",
  "SaleIdempotency", "SaleItem", "Commission", "Adjustment", "GlobalConfig",
  "Shift", "StockSnapshot", "DailyIncomeSummary", "ShoppingPlan",
]);
const LEGACY_INDEXES = [
  { table: "Sale", columns: ["branchId", "status", "createdAt"] },
  { table: "Sale", columns: ["status", "createdAt"] },
  { table: "Sale", columns: ["createdAt", "id"] },
  { table: "SaleIdempotency", columns: ["state", "createdAt"] },
];
const AUDIT_INDEXES = [
  { table: "BranchStockAudit", columns: ["branchId", "startedAt"] },
  { table: "BranchStockAudit", columns: ["status", "startedAt"] },
  { table: "BranchStockAuditItem", columns: ["auditId", "inScope", "status"] },
  { table: "BranchStockAuditItem", columns: ["auditId", "productNameSnapshot"] },
];
const LEGACY14_INDEXES = LEGACY_INDEXES.filter(
  (index) => !(index.table === "Sale" && index.columns.join(",") === "createdAt,id")
    && index.table !== "SaleIdempotency",
);
const LEGACY14_MODELS = Prisma.dmmf.datamodel.models
  .filter((model) => LEGACY14_MODEL_NAMES.has(model.name))
  .map((model) => model.name === "Sale"
    ? {
        ...model,
        fields: model.fields.filter(
          (field) => !["idempotencyKeyHash", "idempotencyPayloadHash", "idempotencyRecord"].includes(field.name),
        ),
      }
    : model);
const LEGACY_MODELS = Prisma.dmmf.datamodel.models
  .filter((model) => LEGACY_MODEL_NAMES.has(model.name));
const ALL_MODELS = Prisma.dmmf.datamodel.models;

function hasExactTableSet(
  snapshot: Awaited<ReturnType<typeof readDatabaseSnapshot>>,
  models: typeof Prisma.dmmf.datamodel.models,
): boolean {
  const expected = models.map((model) => model.dbName || model.name).sort();
  const actual = snapshot.tables.filter((table) => table !== "_prisma_migrations").sort();
  return expected.length === actual.length && expected.every((table, index) => table === actual[index]);
}

function safePrismaDiagnostic(error: unknown): string {
  if (!error || typeof error !== "object") return "";
  const message = "message" in error && typeof error.message === "string" ? error.message : "";
  const stderr = "stderr" in error ? error.stderr : undefined;
  const stdout = "stdout" in error ? error.stdout : undefined;
  const raw = [stderr, stdout]
    .map((value) => Buffer.isBuffer(value) ? value.toString("utf8") : typeof value === "string" ? value : "")
    .filter(Boolean)
    .join("\n")
    .trim();
  if (!raw && !message) return "";
  const configuredUrl = process.env.DATABASE_URL;
  return (raw || message)
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
    const snapshot = await readDatabaseSnapshot(client, target);
    if (snapshot.database_name !== target.database) {
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
    const knownMigrationNames = new Set([
      VERIFIED_LEGACY_BASELINE_MIGRATION, LEGACY14_MIGRATION, BASELINE_MIGRATION, AUDIT_MIGRATION,
    ]);
    const unknownMigrations = migrationRows.filter(
      (row) => !knownMigrationNames.has(row.migration_name),
    );
    if (unknownMigrations.length > 0) {
      throw new Error("Existing Prisma migration history contains unapproved migrations; refusing to continue.");
    }
    const incompleteMigrations = migrationRows.filter(
      (row) => !row.finished_at || row.rolled_back_at,
    );
    if (incompleteMigrations.length > 0) {
      throw new Error("An incomplete or rolled-back schema migration requires manual inspection.");
    }
    const legacy14Migration = migrationRows.find((row) => row.migration_name === LEGACY14_MIGRATION);
    const verifiedLegacyBaseline = migrationRows.find(
      (row) => row.migration_name === VERIFIED_LEGACY_BASELINE_MIGRATION,
    );
    const baseline = migrationRows.find((row) => row.migration_name === BASELINE_MIGRATION);
    const additive = migrationRows.find((row) => row.migration_name === AUDIT_MIGRATION);

    if (LEGACY14_MODELS.length !== LEGACY14_MODEL_NAMES.size
        || LEGACY_MODELS.length !== LEGACY_MODEL_NAMES.size) {
      throw new Error("The application Prisma datamodel no longer matches the approved 14/15-table legacy schemas.");
    }

    const isLegacy14 = hasExactTableSet(snapshot, LEGACY14_MODELS);
    const isLegacy15 = hasExactTableSet(snapshot, LEGACY_MODELS);
    const isCurrent17 = hasExactTableSet(snapshot, ALL_MODELS);
    if ([isLegacy14, isLegacy15, isCurrent17].filter(Boolean).length !== 1) {
      throw new Error("Database table set does not match a supported 14-, 15- or 17-table schema.");
    }

    if (isLegacy14) {
      assertExactModelTablesAndColumns(snapshot, LEGACY14_MODELS);
      assertCompatibleSchema(snapshot, target, LEGACY14_MODELS, LEGACY14_INDEXES);
      const valid14History = migrationRows.length === 0
        || (migrationRows.length === 1
          && verifiedLegacyBaseline?.finished_at && !verifiedLegacyBaseline.rolled_back_at);
      if (!valid14History || baseline || additive || legacy14Migration) {
        throw new Error("A 14-table database with existing Prisma migration history requires manual inspection.");
      }
      if (targetState[0].hasAuditTable || targetState[0].hasAuditItemTable) {
        throw new Error("Audit Stok tables exist on a 14-table baseline; refusing to infer schema history.");
      }
      console.log("Verified exact legacy 14-table schema; applying its explicit additive upgrade path.");
    } else if (isLegacy15) {
      assertExactModelTablesAndColumns(snapshot, LEGACY_MODELS);
      assertCompatibleSchema(snapshot, target, LEGACY_MODELS, LEGACY_INDEXES);
      if (additive) {
        throw new Error("Audit Stok migration history exists but its tables are absent; refusing to continue.");
      }
      if (!baseline) {
        const validUpgradeHistory = migrationRows.every((row) =>
          row.migration_name === VERIFIED_LEGACY_BASELINE_MIGRATION
          || row.migration_name === LEGACY14_MIGRATION,
        );
        if (migrationRows.length > 0 && !validUpgradeHistory) {
          throw new Error("Existing Prisma migration history is not an approved 15-table state.");
        }
      }
    } else {
      assertExactModelTablesAndColumns(snapshot, ALL_MODELS);
      assertCompatibleSchema(snapshot, target, ALL_MODELS, [...LEGACY_INDEXES, ...AUDIT_INDEXES]);
      if (!baseline || !additive) {
        throw new Error("Audit Stok tables exist without completed approved schema migration records.");
      }
    }

    if (!verifiedLegacyBaseline) {
      const output = execFileSync(process.execPath, [
        prismaCli, "migrate", "resolve", "--applied", VERIFIED_LEGACY_BASELINE_MIGRATION,
        "--schema", schemaPath,
      ], {
        cwd: packageDir,
        env: process.env,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
        timeout: 10 * 60 * 1000,
      });
      printSafeOutput(output);
    }

    if (!isLegacy14 && !legacy14Migration) {
      const output = execFileSync(process.execPath, [
        prismaCli, "migrate", "resolve", "--applied", LEGACY14_MIGRATION,
        "--schema", schemaPath,
      ], {
        cwd: packageDir,
        env: process.env,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
        timeout: 10 * 60 * 1000,
      });
      printSafeOutput(output);
    }

    if (!baseline && !isLegacy14) {
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

    // On a 14-table database, the guarded idempotency migration sorts before
    // the 15-table baseline marker. The baseline is therefore never recorded
    // before the explicit schema upgrade and its structural preflight.
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
    const migratedSnapshot = await readDatabaseSnapshot(client, target);
    assertExactModelTablesAndColumns(migratedSnapshot, ALL_MODELS);
    assertCompatibleSchema(migratedSnapshot, target, ALL_MODELS, [...LEGACY_INDEXES, ...AUDIT_INDEXES]);
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
