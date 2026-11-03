---
name: AlfathPOS Docker local-server deployment
description: How the docker-compose self-host setup is wired and the non-obvious choices behind it.
---

# AlfathPOS Docker Compose (local server self-host)

Setup lets the owner `git clone` + `docker compose up -d --build` on a local server. Three services: `db` (postgres:16-alpine + `pgdata` volume + healthcheck), `api`, `web` (nginx).

## Version comparison context

- Owner reports the STB was last updated around 2026-10-02. Treat this as an approximate deployment date, not proof of its commit or exact code version.
  **Why:** the workspace can be compared with the cached `origin/main` ref from 2026-10-02, but that does not identify what was actually deployed to STB.
  **How to apply:** use the date only to narrow candidate versions; confirm with a read-only STB commit/hash before claiming equivalence.

## Non-obvious decisions

- **API image is single-stage and keeps the WHOLE monorepo + node_modules intact.**
  **Why:** pnpm uses symlinks into a virtual store (`node_modules/.pnpm`). esbuild externalizes `@prisma/client`, so `dist/index.mjs` must resolve it at runtime via the api package's symlinked `node_modules`. Copying only `dist` into a slim runtime stage would break Prisma resolution. Multi-stage `pnpm deploy` flattening is more fragile and was avoided since Docker can't be tested in the Replit env.
  **How to apply:** keep `COPY . .` + `pnpm install` in the same image you run from; don't "optimize" into a copy-only runtime stage without testing Prisma resolution.

- **The earlier zero-step database initialization assumption is superseded.**
  **Why:** the owner explicitly required database changes and historical maintenance to require separate approval, rather than occur as a side effect of booting an API.
  **How to apply:** do not reuse old deployment advice promising automatic database initialization. Follow the current startup safety contract documented in `artifacts/api-server/STARTUP-SAFETY.md`; first installation now requires a separately approved procedure.

- **Web is nginx serving the Vite static build + proxying `/api` and `/socket.io` to `api:8080`.**
  **Why:** frontend uses same-origin `BASE_URL='/api'` and `io({auth:{token}})` (default path `/socket.io`). nginx must preserve those paths (`proxy_pass http://api:8080;` with NO path segment) and send WebSocket upgrade headers on `/socket.io/`.
  **How to apply:** frontend must be built with `BASE_PATH=/` (vite.config requires `BASE_PATH` and `PORT` envs even at build time) so assets are root-relative.

- **Data does not migrate into Docker.** Fresh install = empty DB + seed only. Carry data over with a manual Postgres dump/restore.

- **Automated backups run as a separate `backup` service** (`docker/db-backup.sh`): loop of `pg_dump --clean --if-exists --no-owner --no-privileges | gzip` to `./backups` host bind-mount, atomic `.tmp`→`mv`, rotation via `find -mtime +KEEP_DAYS -delete`.
  **Why `user: "0:0"`:** the postgres image can run the override entrypoint as root, but to deterministically guarantee write access to a root-owned `./backups` bind mount on any host, the service is pinned to root. pg_dump connects over TCP so running the client as root is safe.
  **Gap to remember:** dumps sit on the SAME host disk → not true DR. Off-host copy (rclone/S3/NAS) + periodic test-restore are the remaining professional steps, intentionally left to the operator's infra choice.
