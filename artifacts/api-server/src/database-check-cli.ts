import { PrismaClient } from "@prisma/client";
import { validateDatabaseTarget } from "./database-target";
import { inspectDatabase } from "./database-readiness";

async function main() {
  const target = validateDatabaseTarget(process.env);
  const prisma = new PrismaClient();
  try {
    await prisma.$connect();
    await inspectDatabase(prisma, target);
    console.log("Database identity and runtime schema are compatible. No changes performed.");
  } finally { await prisma.$disconnect(); }
}
main().catch(() => {
  console.error("Read-only database check failed. Verify target configuration and schema compatibility.");
  process.exitCode = 1;
});
