import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PrismaClient, type Prisma } from "@prisma/client";
import {
  assertStagingSchemaInitTarget,
  validateDatabaseTarget,
  type DatabaseTarget,
} from "./database-target";
import { inspectDatabase } from "./database-readiness";

type EmptySchemaSnapshot = {
  database_name: string;
  schema_exists: boolean;
  relation_count: number;
  routine_count: number;
  custom_type_count: number;
};

type SchemaQueryClient = Pick<PrismaClient, "$queryRaw">;

const approvalFor = (target: DatabaseTarget) =>
  `--approve=schema-init:${target.environment}:${target.host}:${target.port}/${target.database}/${target.schema}`;

export function approveSchemaInitialization(
  args: string[],
  target: DatabaseTarget,
  env: NodeJS.ProcessEnv = process.env,
): void {
  assertStagingSchemaInitTarget(target, env);
  if (!args.includes("--execute") ||
      !args.includes("--acknowledge-empty-schema") ||
      !args.includes(approvalFor(target))) {
    throw new Error(
      "Schema initialization blocked. Require --execute, --acknowledge-empty-schema and exact target-specific --approve.",
    );
  }
}

export async function assertSchemaIsEmpty(
  client: SchemaQueryClient | Prisma.TransactionClient,
  target: DatabaseTarget,
): Promise<void> {
  const rows = await client.$queryRaw<EmptySchemaSnapshot[]>`
    SELECT current_database() AS database_name,
      EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = ${target.schema}) AS schema_exists,
      (SELECT COUNT(*)::int FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = ${target.schema}) AS relation_count,
      (SELECT COUNT(*)::int FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = ${target.schema}) AS routine_count,
      (SELECT COUNT(*)::int FROM pg_type t
        JOIN pg_namespace n ON n.oid = t.typnamespace
        WHERE n.nspname = ${target.schema} AND t.typtype IN ('d', 'e', 'r')) AS custom_type_count`;
  const snapshot = rows[0];
  if (!snapshot || snapshot.database_name !== target.database) {
    throw new Error("Schema initialization refused: connected database identity does not match the approved target.");
  }
  if (!snapshot.schema_exists) {
    throw new Error("Schema initialization refused: the explicitly approved schema does not exist.");
  }
  if (snapshot.relation_count || snapshot.routine_count || snapshot.custom_type_count) {
    throw new Error("Schema initialization refused: target schema is not empty; no objects were changed.");
  }
}

function runPrismaSchemaPush(): void {
  const require = createRequire(import.meta.url);
  const prismaCli = require.resolve("prisma/build/index.js");
  const packageDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  try {
    execFileSync(process.execPath, [
      prismaCli,
      "db",
      "push",
      "--schema",
      path.join(packageDir, "prisma/schema.prisma"),
      "--skip-generate",
    ], {
      cwd: packageDir,
      env: process.env,
      stdio: "ignore",
      timeout: 10 * 60 * 1000,
    });
  } catch {
    // Do not surface Prisma's raw error output because it may contain connection
    // details. A failed push may have left partial DDL, so startup remains gated.
    throw new Error("Prisma schema provisioning failed. API startup remains blocked; inspect the approved QA target before retrying.");
  }
}

export async function initializeEmptyStagingSchema(
  args = process.argv.slice(2),
  env: NodeJS.ProcessEnv = process.env,
  prisma = new PrismaClient(),
): Promise<void> {
  const target = validateDatabaseTarget(env);
  approveSchemaInitialization(args, target, env);
  try {
    await prisma.$connect();
    await prisma.$transaction(async tx => {
      const locks = await tx.$queryRaw<{ locked: boolean }[]>`
        SELECT pg_try_advisory_xact_lock(180043211, 1) AS locked`;
      if (!locks[0]?.locked) {
        throw new Error("Schema initialization refused: another administrative operation is active.");
      }
      await assertSchemaIsEmpty(tx, target);
      runPrismaSchemaPush();
      await inspectDatabase(tx, target);
    }, { timeout: 10 * 60 * 1000, maxWait: 5000 });
    console.log("Empty staging database schema initialized and verified against the built Prisma datamodel.");
  } finally {
    await prisma.$disconnect();
  }
}
