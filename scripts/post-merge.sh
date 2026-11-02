#!/bin/bash
set -e
pnpm install --frozen-lockfile
echo "Dependencies installed. Automatic database schema push is disabled."
