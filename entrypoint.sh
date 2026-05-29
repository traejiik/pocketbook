#!/bin/sh
set -e

# Resolve PB_-prefixed vars (from stack.env or Portainer panel) to the bare
# names Auth.js and the app expect. Bare-name vars take precedence if already set.
export AUTH_URL="${AUTH_URL:-$PB_AUTH_URL}"
export AUTH_SECRET="${AUTH_SECRET:-$PB_AUTH_SECRET}"
export FX_SYNC_SECRET="${FX_SYNC_SECRET:-$PB_FX_SYNC_SECRET}"
export OLLAMA_BASE_URL="${OLLAMA_BASE_URL:-$PB_OLLAMA_BASE_URL}"
export SEED_USER_EMAIL="${SEED_USER_EMAIL:-$PB_SEED_USER_EMAIL}"
export SEED_USER_PASSWORD="${SEED_USER_PASSWORD:-$PB_SEED_USER_PASSWORD}"

if [ -z "$AUTH_SECRET" ] || [ -z "$AUTH_URL" ]; then
  echo "ERROR: PB_AUTH_SECRET and PB_AUTH_URL must be set in /opt/docker/pocketbook/stack.env."
  echo "See DEPLOY.md for setup instructions."
  exit 1
fi

export PB_DATABASE_URL="postgresql://${PB_POSTGRES_USER}:${PB_POSTGRES_PASSWORD}@pocketbook-db:5432/${PB_POSTGRES_DB}"

echo "Running Prisma migrations..."
prisma migrate deploy

echo "Seeding database..."
node /app/prisma/seed.js

echo "Starting Next.js..."
exec node /app/server.js
