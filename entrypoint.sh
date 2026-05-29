#!/bin/sh
set -e

# Resolve PB_-prefixed vars (from the Portainer stack environment panel) to the
# bare names Auth.js and the app expect. Bare-name vars take precedence if set.
export AUTH_URL="${AUTH_URL:-$PB_AUTH_URL}"
export AUTH_SECRET="${AUTH_SECRET:-$PB_AUTH_SECRET}"
export FX_SYNC_SECRET="${FX_SYNC_SECRET:-$PB_FX_SYNC_SECRET}"
export OLLAMA_BASE_URL="${OLLAMA_BASE_URL:-$PB_OLLAMA_BASE_URL}"
export SEED_USER_EMAIL="${SEED_USER_EMAIL:-$PB_SEED_USER_EMAIL}"
export SEED_USER_PASSWORD="${SEED_USER_PASSWORD:-$PB_SEED_USER_PASSWORD}"

# Fail fast with one clear message listing every missing required var, instead of
# crashing mid-migrate/seed (which looks like a random restart loop).
missing=""
[ -z "$AUTH_URL" ] && missing="$missing PB_AUTH_URL"
[ -z "$AUTH_SECRET" ] && missing="$missing PB_AUTH_SECRET"
[ -z "$PB_POSTGRES_PASSWORD" ] && missing="$missing PB_POSTGRES_PASSWORD"
[ -z "$SEED_USER_EMAIL" ] && missing="$missing PB_SEED_USER_EMAIL"
[ -z "$SEED_USER_PASSWORD" ] && missing="$missing PB_SEED_USER_PASSWORD"
if [ -n "$missing" ]; then
  echo "ERROR: missing required variables in the Portainer stack environment panel:"
  echo "  $missing"
  echo "Use the PB_-prefixed names exactly (e.g. PB_AUTH_URL, not AUTH_URL). See DEPLOY.md."
  exit 1
fi

export PB_DATABASE_URL="postgresql://${PB_POSTGRES_USER}:${PB_POSTGRES_PASSWORD}@pocketbook-db:5432/${PB_POSTGRES_DB}"

# Wait for Postgres to accept TCP connections. depends_on: service_healthy only
# gates `compose up` — NOT restart-policy restarts after a host reboot or a
# Watchtower recreate, where this container can start before the DB is ready.
echo "Waiting for database..."
i=0
until node -e "const s=require('net').createConnection(5432,'pocketbook-db');s.setTimeout(2000);s.on('connect',()=>{s.end();process.exit(0)});s.on('timeout',()=>process.exit(1));s.on('error',()=>process.exit(1))" 2>/dev/null; do
  i=$((i+1))
  if [ "$i" -ge 30 ]; then
    echo "ERROR: database not reachable after 60s — giving up (container will restart)."
    exit 1
  fi
  sleep 2
done
echo "Database is up."

echo "Running Prisma migrations..."
prisma migrate deploy

echo "Seeding database..."
node /app/prisma/seed.js

echo "Starting Next.js..."
exec node /app/server.js
