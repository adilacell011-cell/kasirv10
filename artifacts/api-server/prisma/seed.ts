// Legacy entrypoint now uses the same explicit approval gate as db:admin.
// prisma db seed without target-specific confirmation performs no writes.
import { runMaintenance } from "../src/maintenance-cli";
runMaintenance(["seed", ...process.argv.slice(2)]).catch(() => {
  console.error("Seed refused or failed. Use the approved administrative procedure in STARTUP-SAFETY.md.");
  process.exitCode = 1;
});
