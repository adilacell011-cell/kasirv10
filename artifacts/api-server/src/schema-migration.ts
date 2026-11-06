import { assertStagingSchemaInitTarget, type DatabaseTarget } from "./database-target";

export function approveStagingSchemaMigration(
  args: string[],
  target: DatabaseTarget,
  env: NodeJS.ProcessEnv,
): void {
  assertStagingSchemaInitTarget(target, env);
  const approval =
    `--approve=schema-migrate:${target.environment}:${target.host}:${target.port}/${target.database}/${target.schema}`;
  const normalizedArgs = args[0] === "--" ? args.slice(1) : args;
  if (
    normalizedArgs.length !== 2
    || !normalizedArgs.includes("--execute")
    || !normalizedArgs.includes(approval)
  ) {
    throw new Error(
      "Schema migration refused. Require --execute and an exact staging/QA target approval.",
    );
  }
}
