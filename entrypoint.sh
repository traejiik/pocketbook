#!/bin/sh
set -e

export PB_DATABASE_URL="postgresql://${PB_POSTGRES_USER}:${PB_POSTGRES_PASSWORD}@pocketbook-db:5432/${PB_POSTGRES_DB}"

echo "Running Prisma migrations..."
prisma migrate deploy

echo "Seeding database..."
node /app/prisma/seed.js

echo "Starting Next.js..."
exec node /app/server.js
