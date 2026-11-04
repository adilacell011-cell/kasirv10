import { initializeEmptyStagingSchema } from "./database-schema-init";

initializeEmptyStagingSchema().catch(() => {
  console.error("Staging schema initialization refused or failed. No automatic retry; verify the isolated target and inspect it before any retry.");
  process.exitCode = 1;
});
