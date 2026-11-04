---
name: AlfathPOS Docker local-server deployment
description: How the docker-compose self-host setup is wired and the non-obvious choices behind it.
---

# AlfathPOS Docker Compose (local server self-host)

Setup lets the owner `git clone` + `docker compose up -d --build` on a local server. Three services: `db` (postgres:16-alpine + `pgdata` volume + healthcheck), `api`, `web` (nginx).

## Version comparison context

- Owner confirms the STB's last Kasir V10 update was around 2026-10-02; Dockge shows the API/web containers were created that date.
  **Why:** this aligns the reported deployment timeline with the observed container timestamps, though it still does not reveal the source commit.
  **How to apply:** use 2026-10-02 as the STB comparison date; require a commit/hash or image revision label to assert exact code equivalence.

## Non-obvious decisions

- **VPS staging is a separate Kasir V10 installation, not an update to the STB.**
  The VPS is Ubuntu/AMD64 with about 1.9 GiB RAM and also runs ZETAS; the same application images must continue to support ARM64. Keep staging containers, network, database, volumes, and backup path isolated from ZETAS; never point staging at the STB database.
  **Why:** the STB remains in active use, ZETAS must not be disrupted, and staging resource limits must leave host capacity for the existing service.
  **How to apply:** use immutable candidate SHA tags in a uniquely named staging stack; do not pin the application to one CPU architecture or reuse another stack's network/data. The Owner selected `compose.staging.yaml` for the new Dockge VPS stack; keep the generic `compose.dockge.yaml` separate from staging.

- **API image is single-stage and keeps the WHOLE monorepo + node_modules intact.**
  **Why:** pnpm uses symlinks into a virtual store (`node_modules/.pnpm`). esbuild externalizes `@prisma/client`, so `dist/index.mjs` must resolve it at runtime via the api package's symlinked `node_modules`. Copying only `dist` into a slim runtime stage would break Prisma resolution. Multi-stage `pnpm deploy` flattening is more fragile and was avoided since Docker can't be tested in the Replit env.
  **How to apply:** keep `COPY . .` + `pnpm install` in the same image you run from; don't "optimize" into a copy-only runtime stage without testing Prisma resolution.

- **Compose may provision schema only on an explicitly allowlisted, empty local Kasir database.**
  **Why:** the owner explicitly authorized first-install schema creation after VPS startup failed on a database without tables, while requiring existing/incompatible data to remain untouched.
  **How to apply:** run the guarded one-shot Compose schema initializer after the internal `db` service is healthy; skip a compatible schema, reject a partial/incompatible one, and keep API startup itself read-only with `db:check`. Never run an unguarded `prisma db push`, seed, archive, or backfill at startup.

- **Web is nginx serving the Vite static build + proxying `/api` and `/socket.io` to `api:8080`.**
  **Why:** frontend uses same-origin `BASE_URL='/api'` and `io({auth:{token}})` (default path `/socket.io`). nginx must preserve those paths (`proxy_pass http://api:8080;` with NO path segment) and send WebSocket upgrade headers on `/socket.io/`.
  **How to apply:** frontend must be built with `BASE_PATH=/` (vite.config requires `BASE_PATH` and `PORT` envs even at build time) so assets are root-relative.

- **Data does not migrate into Docker.** Fresh install = empty DB + seed only. Carry data over with a manual Postgres dump/restore.

- **Automated backups run as a separate `backup` service** (`docker/db-backup.sh`): loop of `pg_dump --clean --if-exists --no-owner --no-privileges | gzip` to `./backups` host bind-mount, atomic `.tmp`→`mv`, rotation via `find -mtime +KEEP_DAYS -delete`.
  **Why `user: "0:0"`:** the postgres image can run the override entrypoint as root, but to deterministically guarantee write access to a root-owned `./backups` bind mount on any host, the service is pinned to root. pg_dump connects over TCP so running the client as root is safe.
  **Gap to remember:** dumps sit on the SAME host disk → not true DR. Off-host copy (rclone/S3/NAS) + periodic test-restore are the remaining professional steps, intentionally left to the operator's infra choice.
