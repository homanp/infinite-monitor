#!/bin/sh
set -e

# Seed the persistent volume with the pre-built widget workspace if it's empty
if [ ! -d "/app/data/widget-workspace/node_modules" ]; then
  echo "[entrypoint] Seeding widget workspace into volume..."
  cp -r /app/widget-workspace-seed/* /app/data/widget-workspace/ 2>/dev/null || true
  cp -r /app/widget-workspace-seed/.[!.]* /app/data/widget-workspace/ 2>/dev/null || true
  echo "[entrypoint] Widget workspace seeded."
fi

mkdir -p /app/data/widget-builds /app/data/widgets-dist

exec node server.js
