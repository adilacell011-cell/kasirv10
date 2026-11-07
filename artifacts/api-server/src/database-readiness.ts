import { Prisma, type PrismaClient } from "@prisma/client";
import type { RequestHandler } from "express";
import type { DatabaseTarget } from "./database-target";

export type SchemaSnapshot = {
  database_name: string;
  tables: string[];
  columns: { table_name: string; column_name: string; udt_name: string; is_nullable: string }[];
  indexes: { table_name: string; columns: string[]; is_unique: boolean }[];
  foreign_keys: {
    table_name: string; columns: string[]; target_table: string; target_schema: string;
    target_columns: string[]; delete_action: string; update_action: string;
  }[];
};
const scalarTypes: Record<string, string> = {
  String: "text", Int: "int4", Float: "float8", Boolean: "bool",
  DateTime: "timestamp", Json: "jsonb", BigInt: "int8", Decimal: "numeric", Bytes: "bytea",
};
const same = (a: string[], b: readonly string[]) => a.length === b.length && a.every((v, i) => v === b[i]);

export function assertExactModelTablesAndColumns(
  snapshot: SchemaSnapshot,
  models: readonly { name: string; dbName?: string | null; fields: readonly { kind: string; name: string; dbName?: string | null }[] }[],
  allowedExtraTables: readonly string[] = ["_prisma_migrations"],
): void {
  const expectedTables = new Set(models.map((model) => model.dbName || model.name));
  const allowedExtras = new Set(allowedExtraTables);
  const actualTables = new Set(snapshot.tables);
  const unexpectedTables = [...actualTables].filter(
    (table) => !expectedTables.has(table) && !allowedExtras.has(table),
  );
  const missingTables = [...expectedTables].filter((table) => !actualTables.has(table));
  if (unexpectedTables.length || missingTables.length) {
    throw new Error(
      `Incompatible schema table set: missing [${missingTables.sort().join(",")}], unexpected [${unexpectedTables.sort().join(",")}].`,
    );
  }

  for (const model of models) {
    const table = model.dbName || model.name;
    const expectedColumns = new Set(
      model.fields.filter((field) => field.kind === "scalar").map((field) => field.dbName || field.name),
    );
    const actualColumns = new Set(
      snapshot.columns.filter((column) => column.table_name === table).map((column) => column.column_name),
    );
    const missingColumns = [...expectedColumns].filter((column) => !actualColumns.has(column));
    const unexpectedColumns = [...actualColumns].filter((column) => !expectedColumns.has(column));
    if (missingColumns.length || unexpectedColumns.length) {
      throw new Error(
        `Incompatible schema columns for ${table}: missing [${missingColumns.sort().join(",")}], unexpected [${unexpectedColumns.sort().join(",")}].`,
      );
    }
  }
}

export function assertCompatibleSchema(
  snapshot: SchemaSnapshot,
  target: DatabaseTarget,
  models = Prisma.dmmf.datamodel.models,
  expectedIndexes: { table: string; columns: string[]; isUnique?: boolean }[] = [],
) {
  if (snapshot.database_name !== target.database) throw new Error("Connected database identity mismatch.");
  for (const model of models) {
    const table = model.dbName || model.name;
    for (const field of model.fields.filter(f => f.kind === "scalar")) {
      const column = field.dbName || field.name;
      const actual = snapshot.columns.find(c => c.table_name === table && c.column_name === column);
      if (!actual || actual.udt_name !== scalarTypes[field.type] ||
          actual.is_nullable !== (field.isRequired ? "NO" : "YES")) {
        throw new Error(`Incompatible schema: ${table}.${column} missing or wrong type/nullability.`);
      }
    }
    const uniqueKeys: string[][] = [
      ...model.fields.filter(f => f.isId || f.isUnique).map(f => [f.dbName || f.name]),
      ...model.uniqueFields.map(fields => fields.map(name => {
        const field = model.fields.find(f => f.name === name)!;
        return field.dbName || field.name;
      })),
    ];
    for (const columns of uniqueKeys) {
      if (!snapshot.indexes.some(i => i.table_name === table && i.is_unique && same(i.columns, columns))) {
        throw new Error(`Incompatible schema: missing unique key on ${table}(${columns.join(",")}).`);
      }
    }
    for (const field of model.fields.filter(f => f.kind === "object" && f.relationFromFields?.length)) {
      const referenced = Prisma.dmmf.datamodel.models.find(m => m.name === field.type)!;
      const columns = field.relationFromFields!.map(name => {
        const f = model.fields.find(f => f.name === name)!;
        return f.dbName || f.name;
      });
      const references = field.relationToFields!.map(name => {
        const f = referenced.fields.find(f => f.name === name)!;
        return f.dbName || f.name;
      });
      const deletion = field.relationOnDelete || (field.isRequired ? "Restrict" : "SetNull");
      const deleteAction = ({ Restrict: "r", SetNull: "n", Cascade: "c", NoAction: "a", SetDefault: "d" } as Record<string, string>)[deletion];
      if (!snapshot.foreign_keys.some(fk => fk.table_name === table &&
          same(fk.columns, columns) && fk.target_table === (referenced.dbName || referenced.name) &&
          fk.target_schema === target.schema && same(fk.target_columns, references) &&
          fk.delete_action === deleteAction && fk.update_action === "c")) {
        throw new Error(`Incompatible schema: missing or incompatible relation on ${table}(${columns.join(",")}).`);
      }
    }
  }
  for (const expected of expectedIndexes) {
    if (!snapshot.indexes.some((index) =>
      index.table_name === expected.table &&
      index.is_unique === Boolean(expected.isUnique) &&
      same(index.columns, expected.columns))) {
      throw new Error(
        `Incompatible schema: missing or incompatible index on ${expected.table}(${expected.columns.join(",")}).`,
      );
    }
  }
}

// One SELECT and one catalog snapshot. No DDL, data writes or automatic repairs.
export async function readDatabaseSnapshot(
  prisma: Pick<PrismaClient, "$queryRaw">,
  target: DatabaseTarget,
) {
  const snapshots = await prisma.$queryRaw<SchemaSnapshot[]>`
    SELECT current_database() AS database_name,
      COALESCE((SELECT json_agg(t.table_name ORDER BY t.table_name) FROM (
        SELECT table_name FROM information_schema.tables
        WHERE table_schema = ${target.schema} AND table_type = 'BASE TABLE'
      ) t), '[]'::json) AS tables,
      COALESCE((SELECT json_agg(c) FROM (
        SELECT table_name, column_name, udt_name, is_nullable
        FROM information_schema.columns WHERE table_schema = ${target.schema}
      ) c), '[]'::json) AS columns,
      COALESCE((SELECT json_agg(i) FROM (
        SELECT t.relname AS table_name, ix.indisunique AS is_unique,
          ARRAY(SELECT a.attname::text FROM unnest(ix.indkey) WITH ORDINALITY k(attnum, ord)
            JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = k.attnum
            WHERE k.ord <= ix.indnkeyatts ORDER BY k.ord) AS columns
        FROM pg_index ix JOIN pg_class t ON t.oid = ix.indrelid
        JOIN pg_namespace n ON n.oid = t.relnamespace
        WHERE n.nspname = ${target.schema} AND ix.indisvalid
          AND ix.indpred IS NULL AND ix.indexprs IS NULL
      ) i), '[]'::json) AS indexes,
      COALESCE((SELECT json_agg(f) FROM (
        SELECT t.relname AS table_name, rt.relname AS target_table, rn.nspname AS target_schema,
          ARRAY(SELECT a.attname::text FROM unnest(con.conkey) WITH ORDINALITY k(attnum, ord)
            JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = k.attnum ORDER BY k.ord) AS columns,
          ARRAY(SELECT a.attname::text FROM unnest(con.confkey) WITH ORDINALITY k(attnum, ord)
            JOIN pg_attribute a ON a.attrelid = rt.oid AND a.attnum = k.attnum ORDER BY k.ord) AS target_columns,
          con.confdeltype::text AS delete_action, con.confupdtype::text AS update_action
        FROM pg_constraint con JOIN pg_class t ON t.oid = con.conrelid
        JOIN pg_namespace n ON n.oid = t.relnamespace
        JOIN pg_class rt ON rt.oid = con.confrelid JOIN pg_namespace rn ON rn.oid = rt.relnamespace
        WHERE con.contype = 'f' AND con.convalidated AND n.nspname = ${target.schema}
      ) f), '[]'::json) AS foreign_keys`;
  if (!snapshots[0]) throw new Error("Database readiness returned no metadata.");
  return snapshots[0];
}

export async function inspectDatabase(
  prisma: Pick<PrismaClient, "$queryRaw">,
  target: DatabaseTarget,
  models = Prisma.dmmf.datamodel.models,
  expectedIndexes: { table: string; columns: string[]; isUnique?: boolean }[] = [],
) {
  const snapshot = await readDatabaseSnapshot(prisma, target);
  assertCompatibleSchema(snapshot, target, models, expectedIndexes);
}

export function createReadiness(check: () => Promise<void>) {
  let inFlight: Promise<void> | undefined;
  // Share overlapping probes, but never cache a successful check across requests.
  const verify = () => {
    if (!inFlight) {
      let timer: ReturnType<typeof setTimeout>;
      inFlight = Promise.race([
        Promise.resolve().then(check),
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => reject(new Error("Database readiness timed out.")), 5000);
          timer.unref();
        }),
      ]).finally(() => { clearTimeout(timer); inFlight = undefined; });
    }
    return inFlight;
  };
  const health: RequestHandler = async (_req, res) => {
    try { await verify(); res.json({ status: "ok", database: "connected", schema: "compatible" }); }
    catch { res.status(503).json({ status: "unavailable", database: "not-ready" }); }
  };
  const gate: RequestHandler = async (_req, res, next) => {
    try { await verify(); next(); }
    catch { res.status(503).json({ error: "Database belum siap. Transaksi tidak diproses." }); }
  };
  return { verify, health, gate };
}

export async function prepareDatabase(
  prisma: Pick<PrismaClient, "$connect">,
  verify: () => Promise<void>,
  listen: () => Promise<void>,
) {
  await prisma.$connect();
  await verify();
  await listen();
}
