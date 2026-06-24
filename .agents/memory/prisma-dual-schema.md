---
name: Prisma dual-schema pitfall
description: Why Prisma can ignore your edited schema when two schema files exist.
---

Prisma CLI looks for `./schema.prisma` (cwd root) before `./prisma/schema.prisma`.
If both exist, it loads the root one and silently ignores edits made to the one
under `prisma/`.

**Why:** this bit us during a migration — a `cp -r` accidentally left a copy at the
package root while we edited `prisma/schema.prisma` (e.g. removing `directUrl`).
`db push` kept failing on the already-fixed line because it was reading the stale
root copy.

**How to apply:** keep exactly one schema, conventionally `prisma/schema.prisma`.
If `prisma db push`/`generate` reports an error on a line you already changed, check
for a duplicate schema file (`find . -maxdepth 2 -name '*.prisma'`) and delete the
stray one. The CLI prints `Prisma schema loaded from <path>` — confirm it matches the
file you edited.
