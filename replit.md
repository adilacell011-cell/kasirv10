# Alfath Pulsa Manajemen (AlfathPOS)

An Indonesian point-of-sale and stock/transaction management system for a multi-branch pulsa (mobile credit) business. Migrated from a Vercel/v0 import into Replit's pnpm multi-artifact workspace.

## Run & Operate

- Workflows (not root `pnpm dev`) run the apps:
  - `artifacts/alfath-pos: web` — Vite + React frontend (served at `/`)
  - `artifacts/api-server: API Server` — Express backend (served at `/api` and `/socket.io`)
- `pnpm --filter @workspace/api-server run db:push` — push Prisma schema to the database (dev only)
- `pnpm --filter @workspace/api-server run db:studio` — open Prisma Studio
- Required env: `DATABASE_URL` (Postgres). Optional: `JWT_SECRET` (falls back to a default dev secret).
- Seeded login credentials (created on server startup): `admin` / `admin123` (ADMIN), `cashier` / `cashier123` (CASHIER). Default branch: "Cabang Utama".

## Stack

- pnpm workspaces, Node.js, TypeScript
- Frontend: Vite 7 + React 19, Tailwind v4, vite-plugin-pwa, lucide-react, recharts, html5-qrcode, firebase (Firestore + Google sign-in), socket.io-client
- Backend: Express 4, Prisma 5 + PostgreSQL, socket.io, firebase-admin, JWT (jsonwebtoken), bcryptjs, helmet, morgan
- Backend build: esbuild bundle (CJS deps bundled; `@prisma/client`, `firebase-admin` externalized)

## Where things live

- Frontend app: `artifacts/alfath-pos/` — giant single-file UI in `src/App.tsx`; API client in `src/services/api.ts` (BASE_URL `/api`, bearer token in localStorage); Firebase in `src/lib/firebase.ts` (reads `firebase-applet-config.json`).
- Backend: `artifacts/api-server/src/index.ts` — all Express routes, auth middleware, socket.io, startup seed.
- DB schema (source of truth): `artifacts/api-server/prisma/schema.prisma`.
- Backend Firebase config: `artifacts/api-server/src/firebaseConfig.ts`.

## Architecture decisions

- Hybrid data layer: the frontend reads some collections (products, sales, shoppingPlans) directly from Firebase Firestore AND uses the Express/Prisma API. Login and the primary flows go through the Express API (`/api/auth/login`, `/api/products`, etc.).
- Kept Prisma (not converted to Drizzle) to preserve original behavior and reduce migration risk.
- Frontend and backend are separate artifacts; the frontend connects socket.io same-origin via `io()`, so `/socket.io` is routed to the api-server in its `artifact.toml` paths.
- Backend serves API only; static frontend serving and Vite middleware from the original single-server setup were removed.

## User preferences

_Populate as you build._

## Gotchas

- Prisma resolves `./schema.prisma` over `./prisma/schema.prisma` if both exist — keep only `prisma/schema.prisma`.
- Per the migration task: strict typecheck is out of scope (copied code contains `// @ts-ignore` and `any`); fixing pre-existing bugs is out of scope.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
- See the `artifacts` skill for editing `artifact.toml` (use `verifyAndReplaceArtifactToml`, never edit directly)
