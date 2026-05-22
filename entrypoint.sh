#!/bin/sh
set -e

if [ -z "$NEXTAUTH_SECRET" ] || [ -z "$NEXTAUTH_URL" ]; then
  echo "ERROR: NEXTAUTH_SECRET and NEXTAUTH_URL must be set in Portainer stack environment variables."
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
