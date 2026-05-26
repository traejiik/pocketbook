# Pocketbook — Homelab Deployment Runbook

Stack: Next.js 16 · React 19 · Tailwind CSS 4 · Node 24 · Postgres 16 · Docker Compose · nginx-proxy-manager

---

## Host-side secrets file (`stack.env`)

Secrets are stored in a file on the Docker host rather than in Portainer's env panel.
This means **Watchtower restarts and Portainer GitOps redeployments both work reliably** — Docker
reads the file directly on every container start, so secrets are never dropped.

### One-time setup (run once on the Docker host)

```bash
mkdir -p /opt/docker/pocketbook
cp stack.env.example /opt/docker/pocketbook/stack.env
nano /opt/docker/pocketbook/stack.env   # fill in every value
```

**Required values to set** (no defaults — left blank will brick the container):

| Key in `stack.env` | Example |
| --- | --- |
| `AUTH_URL` | `https://pocketbook.yourdomain.com` |
| `AUTH_SECRET` | *(output of `openssl rand -base64 32`)* |
| `SEED_USER_EMAIL` | `you@yourdomain.com` |
| `SEED_USER_PASSWORD` | *(strong password)* |
| `FX_SYNC_SECRET` | *(output of `openssl rand -hex 32`)* |
| `POSTGRES_PASSWORD` | *(strong password)* |
| `PB_POSTGRES_PASSWORD` | *(same as `POSTGRES_PASSWORD`)* |

**Optional** (sensible defaults apply if omitted):

| Key | Default |
| --- | --- |
| `PB_USER_DISPLAY_NAME` | `Pocketbook` |
| `PB_INSTANCE_NAME` | *(empty — no label shown)* |
| `OLLAMA_BASE_URL` | `http://ollama:11434` |

> **Portainer panel**: The "Stack environment variables" panel is no longer used for secrets.
> You only need it if you want to override `PB_DOCKER_DIR` (default: `/opt/docker`).
>
> **Watchtower**: Because `env_file` is stored in the container definition, Watchtower recreates
> containers with the correct secrets automatically — no manual intervention needed after updates.

---

## Pre-deploy checklist

- [ ] `core_net` exists: `docker network ls | grep core_net`
- [ ] AI stack running (Ollama reachable on `core_net` at `$PB_OLLAMA_BASE_URL`)
- [ ] `/opt/docker/pocketbook/stack.env` exists and all required values are filled in
- [ ] `/opt/docker/pocketbook/postgres` directory exists on the host and is writable
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
# Runs prisma/seed.ts — creates the single user row from PB_SEED_USER_EMAIL / PB_SEED_USER_PASSWORD.
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
docker compose exec pocketbook-web sh -lc \
  'wget -qO- --header="X-Sync-Secret: $FX_SYNC_SECRET" --post-data="" http://localhost:3000/api/fx/sync'
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
| --- | --- |
| Login fails immediately | `PB_NEXTAUTH_SECRET` mismatch or `PB_NEXTAUTH_URL` not matching the actual URL |
| `PrismaClientInitializationError` on first request | DB not yet healthy — check `docker compose ps` and wait for `pocketbook-db` to show `healthy` |
| AI insights load forever | Ollama unreachable — verify `PB_OLLAMA_BASE_URL` in `.env` and that Ollama is on `core_net` |
| FX sync returns 401 | `PB_FX_SYNC_SECRET` in `.env` doesn't match the value baked into `fx-sync` container |
| NPM can't reach the app | `pocketbook-web` not joined to `core_net` — verify with `docker inspect pocketbook-web` |
