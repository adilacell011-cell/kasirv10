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
import { approveSchemaMigrationCheck, approveStagingSchemaMigration } from "./schema-migration";

const BASELINE_MIGRATION = "20261106110000_baseline_existing_15_table_schema";
const AUDIT_MIGRATION = "20261106120000_add_branch_stock_audit_tables";
const STOCK_TRANSFER_MIGRATION = "20261112090000_add_stock_transfer_workflow";
const STOCK_TRANSFER_SKU_CORRECTION_MIGRATION = "20261112100000_add_transfer_sku_corrections";
const STOCK_TRANSFER_BATCH_MIGRATION = "20261112110000_add_stock_transfer_batch_id";
const STOCK_TRANSFER_RETURN_MIGRATION = "20261112120000_add_stock_transfer_return_reference";
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
const STOCK_TRANSFER_INDEXES = [
  { table: "StockTransfer", columns: ["sourceBranchId", "status", "createdAt"] },
  { table: "StockTransfer", columns: ["targetBranchId", "status", "createdAt"] },
  { table: "StockTransfer", columns: ["productId", "createdAt"] },
];
const STOCK_TRANSFER_SKU_CORRECTION_INDEXES = [
  { table: "StockTransferSkuCorrection", columns: ["transferId", "createdAt"] },
  { table: "StockTransferSkuCorrection", columns: ["status", "createdAt"] },
  { table: "StockTransferSkuCorrection", columns: ["actualProductId", "createdAt"] },
];
const STOCK_TRANSFER_BATCH_INDEXES = [
  { table: "StockTransfer", columns: ["batchId", "createdAt"] },
];
const STOCK_TRANSFER_RETURN_INDEXES = [
  { table: "StockTransfer", columns: ["returnOfId", "createdAt"] },
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
const PRE_TRANSFER_MODELS = Prisma.dmmf.datamodel.models
  .filter((model) => model.name !== "StockTransfer" && model.name !== "StockTransferSkuCorrection");
const ALL_MODELS = Prisma.dmmf.datamodel.models;
const withoutTransferReturnFields = (model: (typeof Prisma.dmmf.datamodel.models)[number]) =>
  model.name === "StockTransfer"
    ? {
        ...model,
        fields: model.fields.filter((field) => !["returnOfId", "returnOf", "returns"].includes(field.name)),
      }
    : model;
const withoutTransferBatchField = (model: (typeof Prisma.dmmf.datamodel.models)[number]) =>
  model.name === "StockTransfer"
    ? { ...model, fields: model.fields.filter((field) => field.name !== "batchId") }
    : model;
const PRE_SKU_CORRECTION_MODELS = Prisma.dmmf.datamodel.models
  .filter((model) => model.name !== "StockTransferSkuCorrection")
  .map(withoutTransferReturnFields)
  .map(withoutTransferBatchField);
const PRE_BATCH_MODELS = Prisma.dmmf.datamodel.models
  .map(withoutTransferReturnFields)
  .map(withoutTransferBatchField);
const PRE_RETURN_MODELS = Prisma.dmmf.datamodel.models.map(withoutTransferReturnFields);

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
  const args = process.argv.slice(2);
  const checkOnly = args.includes("--check");
  const target = validateDatabaseTarget(process.env);
  if (checkOnly) {
    approveSchemaMigrationCheck(args, target, process.env);
  } else {
    approveStagingSchemaMigration(args, target, process.env);
  }

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
      hasTransferTable: boolean;
      hasSkuCorrectionTable: boolean;
      hasTransferBatchColumn: boolean;
      hasTransferReturnColumn: boolean;
    }>>`
      SELECT current_database() AS "currentDatabase",
        to_regclass('public."_prisma_migrations"') IS NOT NULL AS "hasMigrationTable",
        to_regclass('public."BranchStockAudit"') IS NOT NULL AS "hasAuditTable",
        to_regclass('public."BranchStockAuditItem"') IS NOT NULL AS "hasAuditItemTable",
        to_regclass('public."StockTransfer"') IS NOT NULL AS "hasTransferTable",
        to_regclass('public."StockTransferSkuCorrection"') IS NOT NULL AS "hasSkuCorrectionTable",
        EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_schema = 'public'
            AND table_name = 'StockTransfer'
            AND column_name = 'batchId'
        ) AS "hasTransferBatchColumn",
        EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_schema = 'public'
            AND table_name = 'StockTransfer'
            AND column_name = 'returnOfId'
        ) AS "hasTransferReturnColumn"
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
      VERIFIED_LEGACY_BASELINE_MIGRATION, LEGACY14_MIGRATION, BASELINE_MIGRATION,
      AUDIT_MIGRATION, STOCK_TRANSFER_MIGRATION, STOCK_TRANSFER_SKU_CORRECTION_MIGRATION,
      STOCK_TRANSFER_BATCH_MIGRATION, STOCK_TRANSFER_RETURN_MIGRATION,
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
    const transferMigration = migrationRows.find((row) => row.migration_name === STOCK_TRANSFER_MIGRATION);
    const skuCorrectionMigration = migrationRows.find(
      (row) => row.migration_name === STOCK_TRANSFER_SKU_CORRECTION_MIGRATION,
    );
    const transferBatchMigration = migrationRows.find(
      (row) => row.migration_name === STOCK_TRANSFER_BATCH_MIGRATION,
    );
    const transferReturnMigration = migrationRows.find(
      (row) => row.migration_name === STOCK_TRANSFER_RETURN_MIGRATION,
    );

    if (LEGACY14_MODELS.length !== LEGACY14_MODEL_NAMES.size
        || LEGACY_MODELS.length !== LEGACY_MODEL_NAMES.size) {
      throw new Error("The application Prisma datamodel no longer matches the approved 14/15-table legacy schemas.");
    }

    const isLegacy14 = hasExactTableSet(snapshot, LEGACY14_MODELS);
    const isLegacy15 = hasExactTableSet(snapshot, LEGACY_MODELS);
    const isCurrent17 = hasExactTableSet(snapshot, PRE_TRANSFER_MODELS);
    const isCurrent18 = hasExactTableSet(snapshot, PRE_SKU_CORRECTION_MODELS);
    const hasCurrentTransferTables = hasExactTableSet(snapshot, PRE_BATCH_MODELS);
    const isPreBatch19 = hasCurrentTransferTables && !targetState[0].hasTransferBatchColumn;
    const isPreReturn19 = hasCurrentTransferTables &&
      targetState[0].hasTransferBatchColumn && !targetState[0].hasTransferReturnColumn;
    const isCurrent19 = hasCurrentTransferTables &&
      targetState[0].hasTransferBatchColumn && targetState[0].hasTransferReturnColumn;
    if ([isLegacy14, isLegacy15, isCurrent17, isCurrent18, isPreBatch19, isPreReturn19, isCurrent19]
      .filter(Boolean).length !== 1) {
      throw new Error("Database schema does not match a supported 14-, 15-, 17-, 18- or 19-table version.");
    }

    if (isLegacy14) {
      assertExactModelTablesAndColumns(snapshot, LEGACY14_MODELS);
      assertCompatibleSchema(snapshot, target, LEGACY14_MODELS, LEGACY14_INDEXES);
      const valid14History = migrationRows.length === 0
        || (migrationRows.length === 1
          && verifiedLegacyBaseline?.finished_at && !verifiedLegacyBaseline.rolled_back_at);
        if (!valid14History || baseline || additive || legacy14Migration || transferMigration || skuCorrectionMigration || transferBatchMigration || transferReturnMigration) {
        throw new Error("A 14-table database with existing Prisma migration history requires manual inspection.");
      }
      if (targetState[0].hasAuditTable || targetState[0].hasAuditItemTable) {
        throw new Error("Audit Stok tables exist on a 14-table baseline; refusing to infer schema history.");
      }
      console.log(checkOnly
        ? "Verified exact legacy 14-table schema; additive upgrade path is available."
        : "Verified exact legacy 14-table schema; applying its explicit additive upgrade path.");
    } else if (isLegacy15) {
      assertExactModelTablesAndColumns(snapshot, LEGACY_MODELS);
      assertCompatibleSchema(snapshot, target, LEGACY_MODELS, LEGACY_INDEXES);
        if (additive || transferMigration || skuCorrectionMigration || transferBatchMigration || transferReturnMigration) {
        throw new Error("Additive schema migration history exists but its tables are absent; refusing to continue.");
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
    } else if (isCurrent17) {
      assertExactModelTablesAndColumns(snapshot, PRE_TRANSFER_MODELS);
      assertCompatibleSchema(snapshot, target, PRE_TRANSFER_MODELS, [...LEGACY_INDEXES, ...AUDIT_INDEXES]);
      if (!baseline || !additive || transferMigration || skuCorrectionMigration || transferBatchMigration || transferReturnMigration) {
        throw new Error("The 17-table schema has unexpected or incomplete migration history.");
      }
    } else if (isCurrent18) {
      assertExactModelTablesAndColumns(snapshot, PRE_SKU_CORRECTION_MODELS);
      assertCompatibleSchema(
        snapshot,
        target,
        PRE_SKU_CORRECTION_MODELS,
        [...LEGACY_INDEXES, ...AUDIT_INDEXES, ...STOCK_TRANSFER_INDEXES],
      );
      if (!baseline || !additive || !transferMigration || skuCorrectionMigration || transferBatchMigration || transferReturnMigration) {
        throw new Error("The 18-table schema has unexpected or incomplete migration history.");
      }
    } else if (isPreBatch19) {
      assertExactModelTablesAndColumns(snapshot, PRE_BATCH_MODELS);
      assertCompatibleSchema(
        snapshot,
        target,
        PRE_BATCH_MODELS,
        [...LEGACY_INDEXES, ...AUDIT_INDEXES, ...STOCK_TRANSFER_INDEXES, ...STOCK_TRANSFER_SKU_CORRECTION_INDEXES],
      );
      if (!baseline || !additive || !transferMigration || !skuCorrectionMigration || transferBatchMigration || transferReturnMigration) {
        throw new Error("The pre-batch 19-table schema has unexpected or incomplete migration history.");
      }
    } else if (isPreReturn19) {
      assertExactModelTablesAndColumns(snapshot, PRE_RETURN_MODELS);
      assertCompatibleSchema(
        snapshot,
        target,
        PRE_RETURN_MODELS,
        [
          ...LEGACY_INDEXES,
          ...AUDIT_INDEXES,
          ...STOCK_TRANSFER_INDEXES,
          ...STOCK_TRANSFER_SKU_CORRECTION_INDEXES,
          ...STOCK_TRANSFER_BATCH_INDEXES,
        ],
      );
      if (!baseline || !additive || !transferMigration || !skuCorrectionMigration ||
          !transferBatchMigration || transferReturnMigration) {
        throw new Error("The pre-return 19-table schema has unexpected or incomplete migration history.");
      }
    } else {
      assertExactModelTablesAndColumns(snapshot, ALL_MODELS);
      assertCompatibleSchema(
        snapshot,
        target,
        ALL_MODELS,
        [
          ...LEGACY_INDEXES,
          ...AUDIT_INDEXES,
          ...STOCK_TRANSFER_INDEXES,
          ...STOCK_TRANSFER_SKU_CORRECTION_INDEXES,
          ...STOCK_TRANSFER_BATCH_INDEXES,
          ...STOCK_TRANSFER_RETURN_INDEXES,
        ],
      );
      if (!baseline || !additive || !transferMigration || !skuCorrectionMigration ||
          !transferBatchMigration || !transferReturnMigration) {
        throw new Error("The return-enabled transfer schema exists without completed approved migration records.");
      }
    }

    if (checkOnly) {
      const schemaVersion = isLegacy14
        ? "supported legacy 14-table schema"
        : isLegacy15
          ? "supported legacy 15-table schema"
          : isCurrent17
            ? "supported 17-table schema; stock-transfer upgrade is available"
            : isCurrent18
              ? "supported 18-table schema; SKU-correction upgrade is available"
          : isPreBatch19
            ? "supported 19-table schema; transfer-batch upgrade is available"
          : isPreReturn19
              ? "supported 19-table schema; physical-return upgrade is available"
              : "current 19-table physical-return schema";
      console.log(
        `Read-only schema preflight passed for ${target.database}: ${schemaVersion}. No changes performed.`,
      );
      return;
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
    assertCompatibleSchema(
      migratedSnapshot,
      target,
      ALL_MODELS,
      [
        ...LEGACY_INDEXES,
        ...AUDIT_INDEXES,
        ...STOCK_TRANSFER_INDEXES,
        ...STOCK_TRANSFER_SKU_CORRECTION_INDEXES,
        ...STOCK_TRANSFER_BATCH_INDEXES,
        ...STOCK_TRANSFER_RETURN_INDEXES,
      ],
    );
    console.log("Schema migration and read-only compatibility check completed.");
  } catch (error) {
    console.error(checkOnly
      ? "Read-only schema preflight failed. No changes were performed."
      : "Prisma schema migration failed. No retry was attempted; verify the exact approved target and migration state.");
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
    "Schema check or migration refused. Verify the explicit database target and target-specific approval.",
  );
  process.exitCode = 1;
});
