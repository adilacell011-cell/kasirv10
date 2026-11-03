---
name: Temporary PostgreSQL test lifecycle
description: Environment behavior when running an ephemeral PostgreSQL server for integration tests
---

In this workspace, a PostgreSQL process launched by a standalone shell command does not remain available to later shell commands. Start the temporary cluster and run its integration tests in one shell invocation, with cleanup in a trap.

**Why:** the shell execution environment cleans up child processes when a command exits, so a test run in a later command cannot connect to that temporary server.

**How to apply:** for local PostgreSQL integration tests, create a temporary data directory, use a socket directory inside it, run the test suite before the shell exits, then stop the server and remove the directory.

For `pg_restore` and `psql`, use a plain PostgreSQL URI rather than Prisma's `?schema=public` URL option; libpq rejects `schema` as an invalid URI parameter. Keep the schema option only for Prisma clients.

**Why:** a QA dump restored successfully once the PostgreSQL CLI connection string was separated from the Prisma datasource URL.

**How to apply:** when backing up/restoring or comparing a Prisma-backed database, use the unmodified PostgreSQL URI for `pg_dump`, `pg_restore`, and `psql`, and add `?schema=...` only to `DATABASE_URL` passed to Prisma.
