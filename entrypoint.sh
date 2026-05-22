#!/bin/sh
set -e

if [ -z "$PB_POSTGRES_USER" ] || [ -z "$PB_POSTGRES_PASSWORD" ] || [ -z "$PB_POSTGRES_DB" ]; then
  echo "ERROR: PB_POSTGRES_USER, PB_POSTGRES_PASSWORD, and PB_POSTGRES_DB must all be"
  echo "set in Portainer stack environment variables. See DEPLOY.md for setup instructions."
  exit 1
fi

export PB_DATABASE_URL="postgresql://${PB_POSTGRES_USER}:${PB_POSTGRES_PASSWORD}@pocketbook-db:5432/${PB_POSTGRES_DB}"

echo "Running Prisma migrations..."
prisma migrate deploy

echo "Seeding database..."
node /app/prisma/seed.js

echo "Starting Next.js..."
exec node /app/server.js
