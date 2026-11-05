---
name: Temporary PostgreSQL test lifecycle
description: Environment behavior when running an ephemeral PostgreSQL server for integration tests
---

In this workspace, a detached PostgreSQL server started from a short shell command may not remain available to later shell commands. A PostgreSQL server launched in the foreground as a long-running background shell task does remain available across tool calls and can be stopped cleanly with `pg_ctl`.

**Why:** child-process cleanup differs between a short-lived shell and a tracked long-running background task; `pg_ctl start` from a short shell did not persist reliably, while a foreground server in a tracked task did.

**How to apply:** for multi-step isolated QA, create a dedicated temporary data directory and start `postgres -D ...` as a foreground background task; keep using that exact cluster across calls, and stop it with `pg_ctl -D ... -m fast -w stop` when finished. For a single-command test, keeping startup, test, and cleanup in one shell invocation remains suitable.

For `pg_restore` and `psql`, use a plain PostgreSQL URI rather than Prisma's `?schema=public` URL option; libpq rejects `schema` as an invalid URI parameter. Keep the schema option only for Prisma clients.

**Why:** a QA dump restored successfully once the PostgreSQL CLI connection string was separated from the Prisma datasource URL.

**How to apply:** when backing up/restoring or comparing a Prisma-backed database, use the unmodified PostgreSQL URI for `pg_dump`, `pg_restore`, and `psql`, and add `?schema=...` only to `DATABASE_URL` passed to Prisma.

## Replit Docker runtime

The Replit Docker engine may fail OCI `exec` operations, including Docker health checks, with a `setns` runtime error even while a container's main process is running. One-off `docker compose run --rm` clients can work.

**Why:** the engine adapter does not reliably support executing a new process inside an existing container; this is an environment limitation, not evidence that the service itself is unhealthy.

**How to apply:** for local image QA, use a temporary untracked Compose override to disable container health checks only when necessary, then test readiness through the app's HTTP endpoint and one-off SQL clients. Do not change the checked-in Compose health checks based only on this limitation; verify those on standard Docker separately.
