# Alfath Pulsa Manajemen (AlfathPOS)

An Indonesian point-of-sale and stock/transaction management system for a multi-branch pulsa (mobile credit) business. Migrated from a Vercel/v0 import into Replit's pnpm multi-artifact workspace. Firebase/Firestore has been fully removed — the app is now self-contained (Postgres only) so it can be installed on a local server with no cloud dependency.

## Run & Operate

- Fresh Replit import setup: run `pnpm install --frozen-lockfile`, then `pnpm --filter @workspace/api-server run db:push` only against the isolated Replit development database when schema setup is needed. API startup does not seed accounts or alter schema. Never run `db:push` against production.
- Keep Express on the compatible 4.x release used by this project; version 4.22.3 resolves the imported lockfile's blocked `proxy-addr` dependency without a major framework upgrade.
- The frontend preview is at `/`; API requests and Socket.IO connections use the same preview origin. Only the frontend and API workflows are needed to run the app; the optional Canvas workflow can remain stopped.
- Replit development starts with a separate database and does not import data from an existing self-hosted installation. There are no default login credentials.
- Workflows (not root `pnpm dev`) run the apps:
  - `artifacts/alfath-pos: web` — Vite + React frontend (served at `/`)
  - `artifacts/api-server: API Server` — Express backend (served at `/api` and `/socket.io`)
- `pnpm --filter @workspace/api-server run db:push` — push Prisma schema to the database (dev only)
- `pnpm --filter @workspace/api-server run db:studio` — open Prisma Studio
- Required env: `DATABASE_URL` and `DB_RUNTIME_ENV`. Development/test must match the independent `PGHOST`/`PGDATABASE`/`PGPORT` target; production additionally requires explicit `DB_EXPECTED_HOST`, `DB_EXPECTED_NAME`, `DB_EXPECTED_PORT`, `DB_EXPECTED_SCHEMA`, and matching `NODE_ENV`. See `artifacts/api-server/STARTUP-SAFETY.md`. Replit development can use the persisted random JWT secret; Docker Compose requires an explicit `JWT_SECRET`.
- API and Socket.IO revalidate the account against the database. User-record edits revoke that account's existing sessions; an API restart alone does not, provided the database and JWT secret remain unchanged.
- Startup does not seed accounts, backfill summaries, archive data, or modify schema. First-install seed credentials must be explicitly supplied through `INITIAL_ADMIN_*` and `INITIAL_CASHIER_*`; never place them in Git or leave them configured after the approved seed.

### Local server (Docker Compose)

- For self-hosting on a local server: `cp .env.example .env`, fill every required database target and secret value, then `docker compose up -d --build`. Put public access behind HTTPS.
- Three services in `docker-compose.yml`: `db` (postgres:16-alpine + `pgdata` volume + healthcheck), `api` (Express/Prisma, `artifacts/api-server/Dockerfile`), `web` (nginx serving the Vite static build + reverse-proxying `/api` and `/socket.io` to `api:8080`, `artifacts/alfath-pos/Dockerfile` + `nginx.conf`).
- API boot only connects and checks target/schema using SELECT; Docker does not run `prisma db push`. Empty databases require separately approved schema provisioning and account initialization; startup refuses incompatible schema instead of repairing it. Data persists in `pgdata`.
- Old/dev data does NOT transfer to a Docker install. Carrying data over requires a separately approved dump/restore procedure; do not run it as part of normal startup.
- Automated backups: a `backup` service (`docker/db-backup.sh`) runs on an interval (`BACKUP_INTERVAL_SECONDS`, default 6h) to `./backups` on the host (gitignored), rotating files older than `BACKUP_KEEP_DAYS`. Runs as root (`user: "0:0"`) so it can write the bind mount. Restore only to an isolated QA database first; never pipe a dump directly into the active production database. Backups share the host with `pgdata`; copy them off-host for disaster recovery.

## Stack

- pnpm workspaces, Node.js, TypeScript
- Frontend: Vite 7 + React 19, Tailwind v4, vite-plugin-pwa, lucide-react, recharts, html5-qrcode, socket.io-client
- Backend: Express 4, Prisma 5 + PostgreSQL, socket.io, JWT (jsonwebtoken), bcryptjs, helmet, morgan
- Backend build: esbuild bundle (CJS deps bundled; `@prisma/client` externalized)

## Where things live

- Frontend app: `artifacts/alfath-pos/` — giant single-file UI in `src/App.tsx`; API client in `src/services/api.ts` (BASE_URL `/api`, bearer token in localStorage).
- Backend: `artifacts/api-server/src/index.ts` — Express routes, database-verified auth middleware, Socket.IO, and read-only database readiness checks.
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
