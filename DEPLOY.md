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
| `PB_AUTH_URL` | `https://pocketbook.yourdomain.com` |
| `PB_AUTH_SECRET` | *(output of `openssl rand -base64 32`)* |
| `PB_SEED_USER_EMAIL` | `you@yourdomain.com` |
| `PB_SEED_USER_PASSWORD` | *(strong password)* |
| `PB_FX_SYNC_SECRET` | *(output of `openssl rand -hex 32`)* |
| `PB_POSTGRES_PASSWORD` | *(output of `openssl rand -hex 32`)* |
| `POSTGRES_PASSWORD` | *(same value as `PB_POSTGRES_PASSWORD`)* |

**Optional** (sensible defaults apply if omitted):

| Key | Default |
| --- | --- |
| `PB_USER_DISPLAY_NAME` | `Pocketbook` |
| `PB_INSTANCE_NAME` | *(empty — no label shown)* |
| `PB_OLLAMA_BASE_URL` | `http://ollama:11434` |

> **Portainer panel (optional overrides)**: Any variable from `stack.env` can be overridden via
> Portainer's "Stack environment variables" panel without editing the file on disk. Use the same
> `PB_*` names as in `stack.env` — Docker Compose maps them to the internal names the app expects
> (e.g. `PB_AUTH_URL` → `AUTH_URL`). Values set in the panel take precedence over the file.
> The panel is also needed if your Docker data root is not `/opt/docker` — set `PB_DOCKER_DIR`.
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

## Verify monthly insights

```bash
# Trigger manually for the current month (idempotent — safe to re-run)
docker compose exec pocketbook-web sh -lc \
  'wget -qO- --header="X-Sync-Secret: $FX_SYNC_SECRET" --post-data="" http://localhost:3000/api/insights/monthly'
# Expected response: {"status":"generated","month":"YYYY-MM"} or {"status":"skipped","reason":"..."}
```

Monthly insights are generated automatically on the 1st of each month at 03:05 (5 minutes after FX
sync) by the `fx-sync` sidecar. Generation can be disabled per-deployment via the
**Auto Monthly Insights** toggle in Settings → Insights. The secret is shared with FX sync
(`PB_FX_SYNC_SECRET`).

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
| Login fails immediately | `PB_AUTH_SECRET` mismatch or `PB_AUTH_URL` not matching the actual URL |
| `PrismaClientInitializationError` on first request | DB not yet healthy — check `docker compose ps` and wait for `pocketbook-db` to show `healthy` |
| AI insights load forever | Ollama unreachable — verify `PB_OLLAMA_BASE_URL` in `stack.env` and that Ollama is on `core_net` |
| FX sync returns 401 | `PB_FX_SYNC_SECRET` in `stack.env` doesn't match the header sent by the `fx-sync` sidecar |
| Monthly insights return 401 | Same secret — `PB_FX_SYNC_SECRET` is shared between FX sync and monthly insights |
| NPM can't reach the app | `pocketbook-web` not joined to `core_net` — verify with `docker inspect pocketbook-web` |
