import { runMaintenance } from "./maintenance-cli";
runMaintenance().catch(() => {
  console.error("Administrative maintenance refused or failed. No automatic retry. See STARTUP-SAFETY.md.");
  process.exitCode = 1;
});
