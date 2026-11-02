#!/bin/sh
set -e

cd /app/artifacts/api-server

echo "[entrypoint] Starting API with read-only database compatibility checks (no schema changes)..."
exec node --enable-source-maps dist/index.mjs
