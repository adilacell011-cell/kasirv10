# Alfath Pulsa Manajemen (AlfathPOS)

An Indonesian point-of-sale and stock/transaction management system for a multi-branch pulsa (mobile credit) business. Migrated from a Vercel/v0 import into Replit's pnpm multi-artifact workspace. Firebase/Firestore has been fully removed — the app is now self-contained (Postgres only) so it can be installed on a local server with no cloud dependency.

## Run & Operate

- Fresh Replit import setup: run `pnpm install --frozen-lockfile`, then `pnpm --filter @workspace/api-server run db:push` against the Replit development database before starting the workflows below. The database schema must exist before startup can seed the default accounts. Do not run `db:push` against production.
- The frontend preview is at `/`; API requests and Socket.IO connections use the same preview origin. Only the frontend and API workflows are needed to run the app; the optional Canvas workflow can remain stopped.
- Change the seeded admin and cashier passwords before using real business data. The Replit development database starts empty and does not import data from an existing self-hosted installation.
- Workflows (not root `pnpm dev`) run the apps:
  - `artifacts/alfath-pos: web` — Vite + React frontend (served at `/`)
  - `artifacts/api-server: API Server` — Express backend (served at `/api` and `/socket.io`)
- `pnpm --filter @workspace/api-server run db:push` — push Prisma schema to the database (dev only)
- `pnpm --filter @workspace/api-server run db:studio` — open Prisma Studio
- Required env: `DATABASE_URL` (Postgres). Optional: `JWT_SECRET` — if unset, the server reads/creates a persisted random secret in `artifacts/api-server/.jwt-secret` (gitignored), so tokens survive restarts. There is no hardcoded fallback secret.
- Seeded login credentials (created on server startup): `admin` / `admin123` (ADMIN), `cashier` / `cashier123` (CASHIER). Default branch: "Cabang Utama".

### Local server (Docker Compose)

- For self-hosting on a local server: `cp .env.example .env` (edit passwords/secret), then `docker compose up -d --build`. App opens at `http://<server-ip>:8080`.
- Three services in `docker-compose.yml`: `db` (postgres:16-alpine + `pgdata` volume + healthcheck), `api` (Express/Prisma, `artifacts/api-server/Dockerfile`), `web` (nginx serving the Vite static build + reverse-proxying `/api` and `/socket.io` to `api:8080`, `artifacts/alfath-pos/Dockerfile` + `nginx.conf`).
- DB schema/tables are created automatically on first boot: the api entrypoint (`artifacts/api-server/docker-entrypoint.sh`) runs `prisma db push --skip-generate` before starting, then the app's startup seed creates the default users/branch. Data persists in the `pgdata` volume across rebuilds.
- Old/dev data does NOT transfer to a Docker install — it starts from an empty DB (only the seed). To carry data over, dump/restore Postgres manually.
- Automated backups: a `backup` service (`docker/db-backup.sh`) pg_dumps on an interval (`BACKUP_INTERVAL_SECONDS`, default 6h) to `./backups` on the host (gitignored), rotating files older than `BACKUP_KEEP_DAYS`. Runs as root (`user: "0:0"`) so it can always write the bind mount. Restore: `gunzip -c backups/<file>.sql.gz | docker compose exec -T db psql -U alfath -d alfath`. NOTE: backups live on the same host — copy them off-host for real disaster recovery.

## Stack

- pnpm workspaces, Node.js, TypeScript
- Frontend: Vite 7 + React 19, Tailwind v4, vite-plugin-pwa, lucide-react, recharts, html5-qrcode, socket.io-client
- Backend: Express 4, Prisma 5 + PostgreSQL, socket.io, JWT (jsonwebtoken), bcryptjs, helmet, morgan
- Backend build: esbuild bundle (CJS deps bundled; `@prisma/client` externalized)

## Where things live

- Frontend app: `artifacts/alfath-pos/` — giant single-file UI in `src/App.tsx`; API client in `src/services/api.ts` (BASE_URL `/api`, bearer token in localStorage).
- Backend: `artifacts/api-server/src/index.ts` — all Express routes, auth middleware, socket.io, startup seed.
- DB schema (source of truth): `artifacts/api-server/prisma/schema.prisma`.

## Architecture decisions

- Single local data layer: ALL data lives in Postgres via the Express/Prisma API. Firebase/Firestore was removed. Shopping plans (formerly the Firestore `shoppingPlans` collection) are now the `ShoppingPlan` Prisma model served at `/api/shopping-plans`. Daily summaries are computed live from sales by the backend.
- Authentication is username/password only (`/api/auth/login`). Google/Firebase sign-in was removed because it cannot work offline on a local server. Security hardening also removed a hardcoded `magicpulsa` master-password login bypass and the hardcoded JWT secret fallback, and stopped resetting the seeded admin/cashier passwords on every restart.
- Kept Prisma (not converted to Drizzle) to preserve original behavior and reduce migration risk.
- Frontend and backend are separate artifacts; the frontend connects socket.io same-origin via `io()`, so `/socket.io` is routed to the api-server in its `artifact.toml` paths.
- Backend serves API only; static frontend serving and Vite middleware from the original single-server setup were removed.
- Realtime is scoped per branch: socket.io clients authenticate via the bearer JWT (`io.use`), and room membership is derived from the verified token claims only (never client-sent role/branch). ADMIN/AUDIT join a `global` room (all branches); CASHIER joins `branch:<id>`. Branch-scoped events (`saleProcessed`, `stockUpdated`, `saleUpdated`) emit via `emitBranch()` to the branch room + global room; catalog-wide product events stay global.
- Stock can never go negative: sale and transfer decrements use a conditional `updateMany({ where: { ..., qty: { gte: n } } })` inside the transaction and abort if no row matched, preventing oversell under concurrency.

## User preferences

_Populate as you build._

## Gotchas

- Prisma resolves `./schema.prisma` over `./prisma/schema.prisma` if both exist — keep only `prisma/schema.prisma`.
- Per the migration task: strict typecheck is out of scope (copied code contains `// @ts-ignore` and `any`); fixing pre-existing bugs is out of scope.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
- See the `artifacts` skill for editing `artifact.toml` (use `verifyAndReplaceArtifactToml`, never edit directly)
