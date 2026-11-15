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

- **The VPS app now uses the restored `kasirv10_migrasi` database; the old staging API/Web are stopped.**
  The Owner tested Admin and cashier flows and confirmed the data matches the latest STB backup. Both databases remain on the existing `kasirv10-staging-db` PostgreSQL volume.
  **Why:** the database container's historical “staging” name does not mean the app should keep using the staging database; stopping that container would also take the migrated database offline.
  **How to apply:** keep the existing PostgreSQL service and volume, point the active API explicitly at `kasirv10_migrasi`, and leave the old staging API/Web stopped. Do not delete the shared volume or rerun schema initialization at app startup.

- **Use one immutable candidate for the `kasirv10_migrasi` preflight and later approved migration; do not create missing tables manually.**
  The Owner agreed to the managed migration path instead of hand-written table creation.
  **Why:** the upgrade includes columns, indexes, relations, and migration history as well as new tables; partial manual SQL can leave the app schema inconsistent, while one candidate avoids rebuilding between the check and migration.
  **How to apply:** run its exact-target `--check` first; only after the result is reviewed, a verified backup exists, and the Owner gives separate approval, run the explicit migration with that same image. Never migrate during app startup.

- **A slim API runtime image must retain Prisma Client, the Prisma CLI, guarded migration files, and the established API package path.**
  **Why:** esbuild externalizes Prisma Client, and the guarded one-off schema migration resolves the Prisma CLI at runtime. Copying only the bundled server can pass a build but fail at startup or during an approved migration.
  **How to apply:** use an explicit runtime-file allowlist and production dependencies; include the generated client, Prisma CLI, schema, migrations, and entrypoint. Build and exercise schema initialization plus `/api/healthz` against an isolated temporary database before using an image elsewhere. Check whether Docker is available in the current workspace instead of assuming it is; when Docker `exec` is unavailable, use one-off Compose clients and host HTTP checks. Never run image QA against a production database.

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
