---
name: Prisma migration baseline for legacy schemas
description: Safe first Prisma Migrate deployment after older environments used db push without a migration history.
---

When a non-empty PostgreSQL database was created or evolved without Prisma migration history, `prisma migrate deploy` fails with P3005. For legacy schemas with multiple known versions, validate the exact tables, columns, nullability/types, keys, relations, and required indexes before recording a no-op verification marker. Do not mark a later schema baseline before the additive migration that makes the schema match it.

**Why:** Kasir V10 has a 14-table legacy schema that lacks Sale idempotency objects and a 15-table schema that already contains them. A 15-table baseline would be false for the 14-table database; direct `migrate deploy` also fails P3005 on a non-empty database without a verified history marker.

**How to apply:** In the manual, exact-target QA/staging runner, validate the current schema version first. Record a generic verified-legacy marker, execute the additive upgrade for the older version, then let Prisma record the newer baseline. For an already-upgraded version, mark the upgrade satisfied only after exact compatibility checks. Reject unknown/partial histories and never run this from API startup.

For this workspace, Replit's development database is `heliumdb`. It is an existing Kasir V10 database with business rows, a 19-table pre-return schema, and initially no Prisma migration history; it is separate from the VPS databases and must not be treated as empty or equivalent to them.

**Why:** The preview API correctly refused to start until its missing return-reference column and migration history were reconciled. A generic `db push` or assumed data copy could affect existing QA records or hide an unknown schema lineage.

**How to apply:** Inspect only schema metadata first. Use the exact-target, user-approved baseline and additive migration path; do not reset `heliumdb`, run `db push`, or target the VPS database while preparing Replit QA.
