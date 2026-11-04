#!/bin/sh
set -e

cd /app/artifacts/api-server

echo "[entrypoint] Verifying database identity and schema compatibility (read-only)..."
node --enable-source-maps dist/database-check-cli.mjs

echo "[entrypoint] Starting API..."
exec node --enable-source-maps dist/index.mjs
