#!/bin/sh
set -e

# ===== Docker Entrypoint for Shift Tracker =====
# 1. Creates database if it doesn't exist (from initial seed or fresh)
# 2. Runs Prisma schema push (applies any schema changes)
# 3. Starts the Next.js standalone server

echo "=== Shift Tracker — Startup ==="

DB_PATH="/app/data/custom.db"
INITIAL_DB="/app/data/custom.db.initial"

# Step 1: Ensure database exists
if [ -f "$DB_PATH" ] && [ -s "$DB_PATH" ]; then
  echo "[startup] Found existing database at $DB_PATH"
else
  echo "[startup] No database found. Creating new one..."
  if [ -f "$INITIAL_DB" ] && [ -s "$INITIAL_DB" ]; then
    echo "[startup] Copying initial database from seed..."
    cp "$INITIAL_DB" "$DB_PATH"
  fi
fi

# Step 2: Apply schema changes (prisma db push)
echo "[startup] Applying schema changes..."
DATABASE_URL="file:$DB_PATH" npx prisma db push --skip-generate 2>&1 || {
  echo "[startup] WARNING: prisma db push failed. Continuing..."
}

# Step 3: If database is still empty/missing, run seed
if [ ! -f "$DB_PATH" ] || [ ! -s "$DB_PATH" ]; then
  echo "[startup] Running initial seed..."
  DATABASE_URL="file:$DB_PATH" npx tsx prisma/seed.ts 2>&1 || {
    echo "[startup] WARNING: Seed failed. You may need to run it manually."
  }
fi

echo "[startup] Database ready."
echo "[startup] Starting Next.js server on port $PORT..."
exec "$@"
