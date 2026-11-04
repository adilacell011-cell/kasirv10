export type DatabaseTarget = {
  environment: "development" | "test" | "production";
  host: string;
  port: string;
  database: string;
  schema: string;
};

export function assertOwnerBootstrapTarget(
  target: DatabaseTarget,
  env: NodeJS.ProcessEnv,
): void {
  const allowed = env.STAGING_OWNER_BOOTSTRAP_TARGET?.trim();
  const actual = `${target.environment}:${target.host}:${target.port}/${target.database}/${target.schema}`;
  const isNonProductionDatabase = /(?:^|[_-])(?:staging|stage|qa|test)(?:[_-]|$)/i.test(target.database);
  if (!isNonProductionDatabase || !allowed || allowed !== actual) {
    throw new Error(
      "Owner bootstrap blocked: the target database must be marked staging/QA/test and STAGING_OWNER_BOOTSTRAP_TARGET must match it exactly.",
    );
  }
}

export function assertStagingSchemaInitTarget(
  target: DatabaseTarget,
  env: NodeJS.ProcessEnv,
): void {
  const allowed = env.STAGING_SCHEMA_INIT_TARGET?.trim();
  const actual = `${target.environment}:${target.host}:${target.port}/${target.database}/${target.schema}`;
  const isStagingDatabase = /(?:^|[_-])(?:staging|stage|qa|test)(?:[_-]|$)/i.test(target.database);
  const isApprovedEndpoint = target.environment === "production"
    ? target.host === "db" && target.port === "5432" && target.database === "kasirv10_staging"
    : target.environment === "test" &&
      ["127.0.0.1", "localhost", "::1"].includes(target.host) && isStagingDatabase;
  if (!isApprovedEndpoint ||
      target.schema !== "public" || !isStagingDatabase || !allowed || allowed !== actual) {
    throw new Error(
      "Schema initialization blocked: require an exact staging/QA target, public schema, and matching STAGING_SCHEMA_INIT_TARGET.",
    );
  }
}

export function assertComposeSchemaInitTarget(
  target: DatabaseTarget,
  env: NodeJS.ProcessEnv,
): void {
  const allowed = env.SCHEMA_INIT_AUTO_TARGET?.trim();
  const actual = `${target.environment}:${target.host}:${target.port}/${target.database}/${target.schema}`;
  const isIsolatedComposeTarget =
    target.environment === "production" &&
    target.host === "db" &&
    target.port === "5432" &&
    target.schema === "public" &&
    ["kasirv10", "kasirv10_staging"].includes(target.database);
  const isIsolatedQaTarget =
    target.environment === "test" &&
    ["127.0.0.1", "localhost", "::1"].includes(target.host) &&
    target.schema === "public" &&
    /(?:^|[_-])(?:staging|stage|qa|test)(?:[_-]|$)/i.test(target.database);

  if ((!isIsolatedComposeTarget && !isIsolatedQaTarget) || !allowed || allowed !== actual) {
    throw new Error(
      "Automatic schema initialization blocked: require an exact approved Compose or isolated QA database target.",
    );
  }
}

// Never include the connection string, URL parser error, username or password
// in an error/log. Validate BEFORE constructing/connecting a database client.
export function validateDatabaseTarget(env: NodeJS.ProcessEnv): DatabaseTarget {
  const environment = env.DB_RUNTIME_ENV;
  if (!["development", "test", "production"].includes(environment || "")) {
    throw new Error("DB_RUNTIME_ENV must explicitly be development, test or production.");
  }
  if ((env.NODE_ENV === "production") !== (environment === "production")) {
    throw new Error("Database environment does not match the application environment.");
  }
  let url: URL;
  try { url = new URL(env.DATABASE_URL || ""); }
  catch { throw new Error("DATABASE_URL is missing or invalid (value redacted)."); }
  if (!["postgresql:", "postgres:"].includes(url.protocol) || url.hash) {
    throw new Error("Only a PostgreSQL database URL without a fragment is allowed.");
  }
  const allowedParameters = new Set([
    "schema", "sslmode", "sslaccept", "sslcert", "sslidentity", "sslpassword",
    "connection_limit", "pool_timeout", "connect_timeout", "socket_timeout",
    "pgbouncer", "statement_cache_size", "application_name",
  ]);
  for (const key of url.searchParams.keys()) {
    if (!allowedParameters.has(key) || url.searchParams.getAll(key).length !== 1) {
      throw new Error("Unsupported or duplicate database URL parameter (value redacted).");
    }
  }
  let database: string;
  try { database = decodeURIComponent(url.pathname.slice(1)); }
  catch { throw new Error("Invalid database name encoding."); }
  const host = url.hostname.toLowerCase();
  const port = url.port || "5432";
  const schema = url.searchParams.get("schema") || "public";
  if (!host || !database || database.includes("/") || !/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(schema)) {
    throw new Error("Invalid database target identity.");
  }
  // On Replit dev/test, the independently supplied PG* target is mandatory.
  // A changed DATABASE_URL must not silently redefine the approved test target.
  if (environment !== "production") {
    if (!env.PGHOST || !env.PGDATABASE) {
      throw new Error("Development/test requires the isolated PGHOST and PGDATABASE target.");
    }
    if (host !== env.PGHOST.toLowerCase() || database !== env.PGDATABASE || port !== (env.PGPORT || "5432")) {
      throw new Error("Database URL does not match the isolated development/test target.");
    }
  }
  const expectedHost = env.DB_EXPECTED_HOST || (environment !== "production" ? env.PGHOST : undefined);
  const expectedName = env.DB_EXPECTED_NAME || (environment !== "production" ? env.PGDATABASE : undefined);
  const expectedPort = env.DB_EXPECTED_PORT || (environment !== "production" ? env.PGPORT || "5432" : undefined);
  if (!expectedHost || !expectedName || !expectedPort) {
    throw new Error("Explicit DB_EXPECTED_HOST, DB_EXPECTED_NAME and DB_EXPECTED_PORT are required in production.");
  }
  if (host !== expectedHost.toLowerCase() || database !== expectedName || port !== expectedPort ||
      schema !== (env.DB_EXPECTED_SCHEMA || "public")) {
    throw new Error("Database target does not match the approved environment configuration.");
  }
  return { environment: environment as DatabaseTarget["environment"], host, port, database, schema };
}
