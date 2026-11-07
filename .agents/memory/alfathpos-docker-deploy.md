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

- **Keep empty-database initialization separate from the existing-schema staging migration.**
  **Why:** first-install databases and the Owner's legacy 14/15-table staging database require different guarded paths; the staging upgrade must preserve existing tables/data and only add Audit Stok tables.
  **How to apply:** local/first-install Compose uses the guarded empty-schema initializer; staging uses the exact allowlisted migration runner before API startup. Never substitute `prisma db push`, seed, archive, or backfill for either path.

- **Web is nginx serving the Vite static build + proxying `/api` and `/socket.io` to `api:8080`.**
  **Why:** frontend uses same-origin `BASE_URL='/api'` and `io({auth:{token}})` (default path `/socket.io`). nginx must preserve those paths (`proxy_pass http://api:8080;` with NO path segment) and send WebSocket upgrade headers on `/socket.io/`.
  **How to apply:** frontend must be built with `BASE_PATH=/` (vite.config requires `BASE_PATH` and `PORT` envs even at build time) so assets are root-relative.

- **Data does not migrate into Docker.** Fresh install = empty DB + seed only. Carry data over with a manual Postgres dump/restore.

- **Automated backups run as a separate `backup` service** (`docker/db-backup.sh`): loop of `pg_dump --clean --if-exists --no-owner --no-privileges | gzip` to `./backups` host bind-mount, atomic `.tmp`→`mv`, rotation via `find -mtime +KEEP_DAYS -delete`.
  **Why `user: "0:0"`:** the postgres image can run the override entrypoint as root, but to deterministically guarantee write access to a root-owned `./backups` bind mount on any host, the service is pinned to root. pg_dump connects over TCP so running the client as root is safe.
  **Gap to remember:** dumps sit on the SAME host disk → not true DR. Off-host copy (rclone/S3/NAS) + periodic test-restore are the remaining professional steps, intentionally left to the operator's infra choice.

- **The current VPS staging dataset is test data; the Owner has explicitly declined backups for this stage.**
  **Why:** the Owner said the staging data is only test data and chose not to back it up.
  **How to apply:** keep the `manual-backup` profile disabled and omit `backup` from staging commands; do not run it unless the Owner changes this decision.
