# Pocketbook — Homelab Deployment Runbook

Stack: Next.js 14 · Postgres 16 · Docker Compose · nginx-proxy-manager

---

## Pre-deploy checklist

- [ ] `core_net` exists: `docker network ls | grep core_net`
- [ ] AI stack running (Ollama reachable on `core_net` at `$OLLAMA_BASE_URL`)
- [ ] `.env` created from `.env.example` with **all** values filled in (no `changeme`, no `localhost`)
- [ ] `${DOCKER_DIR}/pocketbook/postgres` directory exists on the host and is writable
- [ ] GitHub Actions pushed a successful build to GHCR (check the Actions tab on the repo)

---

## First deploy

```bash
# 1. Authenticate with GHCR (once per host)
#    CR_PAT = a GitHub PAT with read:packages scope
echo $CR_PAT | docker login ghcr.io -u traejiik --password-stdin

# 2. Pull and start
docker compose pull
docker compose up -d

# 3. Verify containers are healthy
docker compose ps
# Expected: pocketbook-db → healthy, pocketbook-web → Up, pocketbook-fx-sync → Up
```

## Run migrations (required on first deploy and after any schema change)

```bash
docker compose exec pocketbook-web npx prisma migrate deploy
```

## Seed the database (first deploy only)

```bash
# Runs prisma/seed.ts — creates the single user row from SEED_USER_EMAIL / SEED_USER_PASSWORD.
# Idempotent — safe to re-run (upserts, does not duplicate).
docker compose exec pocketbook-web npx prisma db seed
```

## Optional: import transactions from CSV

```bash
# Copy your CSV onto the container
docker cp seed/transactions.csv pocketbook-web:/app/seed/transactions.csv

# Run the importer (idempotent — skips rows already present)
docker compose exec pocketbook-web npx tsx scripts/csv-import.ts
```

---

## Configure NPM reverse proxy

In the nginx-proxy-manager web UI:

1. Hosts → Proxy Hosts → **Add Proxy Host**
2. Domain name: `pocketbook.<your-homelab-domain>`
3. Scheme: `http` · Forward Hostname/IP: `pocketbook-web` · Port: `3000`
4. Enable SSL → Request Let's Encrypt cert → Force SSL → Save

NPM resolves `pocketbook-web` by container name over `core_net` — no IP address or exposed host port required.

---

## Verify FX rate sync

```bash
# Trigger manually to confirm it can reach frankfurter.app
docker compose exec pocketbook-web wget -qO- \
  --header="X-Sync-Secret: $FX_SYNC_SECRET" \
  --post-data="" \
  http://localhost:3000/api/fx/sync
# Expected response: {"synced": N}
```

The `fx-sync` sidecar runs the same command automatically at 03:00 every night via crond.

---

## Subsequent updates (CI/CD flow)

After a push to `main` triggers a new GHCR build:

```bash
docker compose pull
docker compose up -d

# Only if the Prisma schema changed:
docker compose exec pocketbook-web npx prisma migrate deploy
```

---

## Useful commands

```bash
docker compose logs -f pocketbook-web     # App logs (streaming)
docker compose logs -f pocketbook-db      # Postgres logs
docker compose logs -f fx-sync            # Cron sidecar logs
docker compose ps                         # Status of all containers
docker compose down                       # Stop all (data persists in volume)
docker compose down -v                    # ⚠ DESTRUCTIVE — also removes the postgres volume
```

---

## Troubleshooting

| Symptom | Check |
|---|---|
| Login fails immediately | `NEXTAUTH_SECRET` mismatch or `NEXTAUTH_URL` not matching the actual URL |
| `PrismaClientInitializationError` on first request | DB not yet healthy — check `docker compose ps` and wait for `pocketbook-db` to show `healthy` |
| AI insights load forever | Ollama unreachable — verify `OLLAMA_BASE_URL` and that Ollama is on `core_net` |
| FX sync returns 401 | `FX_SYNC_SECRET` in `.env` doesn't match the value baked into `fx-sync` container |
| NPM can't reach the app | `pocketbook-web` not joined to `core_net` — verify with `docker inspect pocketbook-web` |
