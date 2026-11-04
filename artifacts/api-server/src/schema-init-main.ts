import { initializeEmptyStagingSchema } from "./database-schema-init";

const safePartialSchemaMessage =
  "Schema initialization refused: target is non-empty but incomplete or incompatible; no schema changes were made.";

initializeEmptyStagingSchema().catch(error => {
  if (error instanceof Error && error.message === safePartialSchemaMessage) {
    console.error(safePartialSchemaMessage);
  } else {
    console.error("Schema initialization refused or failed. No retry was attempted; verify the approved target and inspect it before retrying.");
  }
  process.exitCode = 1;
});
