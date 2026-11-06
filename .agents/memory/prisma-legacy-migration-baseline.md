---
name: Prisma migration baseline for legacy schemas
description: Safe first Prisma Migrate deployment after older environments used db push without a migration history.
---

When a non-empty PostgreSQL database was created or evolved with `prisma db push` and has no `_prisma_migrations` table, `prisma migrate deploy` fails with P3005. For a controlled legacy upgrade, first validate the expected legacy schema and exact allowed target, record a no-op baseline with `prisma migrate resolve --applied`, then deploy the additive migration.

**Why:** Kasir V10's existing staging schema was created before Prisma Migrate was introduced; applying the new additive migration directly was rejected by Prisma even though the schema was otherwise valid.

**How to apply:** Keep baseline resolution and `migrate deploy` in a manual, explicit-target maintenance command. Refuse unknown migration history, partial target tables, or databases outside staging/QA. Never put the migration into API startup.
