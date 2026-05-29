# Pocketbook — Homelab Deployment Runbook

Stack: Next.js 16 · React 19 · Tailwind CSS 4 · Node 24 · Postgres 16 · Docker Compose · nginx-proxy-manager

---

## Secrets (Portainer stack environment panel)

Secrets live in **Portainer's stack environment panel**, not in a file on the host or in the repo.
Portainer stores them and re-applies them on every (re)deploy and **Watchtower** recreate, so they
survive restarts. The compose file has **no `env_file:` directive** — that was removed because
Portainer reads `env_file` paths from inside its own container, so a host path like
`/opt/docker/...` or `~/docker/...` is invisible to it and breaks the GitOps pull.

### Setup

In Portainer: open the Pocketbook stack → **Environment variables** → **Advanced mode**, then paste
the lines from `stack.env.example` and fill in every value.

> **With the bundled compose, use the `PB_`-prefixed names in the panel.** That compose only
> interpolates `PB_*` names, so a bare `AUTH_URL` typed into the panel never reaches the container —
> this is the #1 cause of "auth url is needed" boot failures.
>
> The container's `entrypoint.sh` resolves config to the bare names the app + Auth.js read, accepting
> **either** form: a bare name passed straight through by compose (`AUTH_URL=...`) **or** the
> `PB_`-prefixed panel name (`PB_AUTH_URL` → `AUTH_URL`). A bare name wins when both are set, so a
> custom compose that passes the bare names through (e.g. `AUTH_URL=${PB_AUTH_URL}`) is also supported.

**Required** (no defaults — left blank will brick the container):

| Key in the panel | Example |
| --- | --- |
| `PB_AUTH_URL` | `https://pocketbook.yourdomain.com` |
| `PB_AUTH_SECRET` | *(output of `openssl rand -base64 32`)* |
| `PB_SEED_USER_EMAIL` | `you@yourdomain.com` |
| `PB_SEED_USER_PASSWORD` | *(strong password)* |
| `PB_FX_SYNC_SECRET` | *(output of `openssl rand -hex 32`)* |
| `PB_POSTGRES_PASSWORD` | *(output of `openssl rand -hex 32`)* |

**Optional** (sensible defaults apply if omitted):

| Key | Default |
| --- | --- |
| `PB_USER_DISPLAY_NAME` | `Pocketbook` |
| `PB_INSTANCE_NAME` | *(empty — no label shown)* |
| `PB_OLLAMA_BASE_URL` | `http://ollama:11434` |
| `PB_DOCKER_DIR` | `/opt/docker` *(host base path for bind-mount volumes)* |

> **Shared Postgres stacks**: only `PB_POSTGRES_PASSWORD` is used — there is no unprefixed
> `POSTGRES_PASSWORD` to collide with another postgres service sharing the same stack environment.

---

## Pre-deploy checklist

- [ ] `core_net` exists: `docker network ls | grep core_net`
- [ ] AI stack running (Ollama reachable on `core_net` at `$PB_OLLAMA_BASE_URL`)
- [ ] All required `PB_*` variables are set in the Portainer stack environment panel
- [ ] `/opt/docker/pocketbook/postgres` directory exists on the host and is writable (or set `PB_DOCKER_DIR`)
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
| `stage=prisma-migrate` with `datasource.url property is required` | Stale/broken image missing `prisma.config.ts` in the runner — pull/redeploy `v1.0.7` or newer |
| `auth url is needed` / boot loop | `AUTH_URL`/`AUTH_SECRET` not reaching the container — with the bundled compose, set `PB_AUTH_URL`/`PB_AUTH_SECRET` in the panel (a bare `AUTH_URL` in the panel is ignored, since that compose only interpolates `PB_*`) |
| AI insights load forever | Ollama unreachable — verify `PB_OLLAMA_BASE_URL` in the panel and that Ollama is on `core_net` |
| FX sync returns 401 | `PB_FX_SYNC_SECRET` in the panel doesn't match the header sent by the `fx-sync` sidecar |
| Monthly insights return 401 | Same secret — `PB_FX_SYNC_SECRET` is shared between FX sync and monthly insights |
| NPM can't reach the app | `pocketbook-web` not joined to `core_net` — verify with `docker inspect pocketbook-web` |

### Diagnosing a boot / restart loop

If `pocketbook-web` keeps restarting, the cause is captured on the persistent volume even
after the console scrolls or a Watchtower/Portainer recreate wipes `docker logs`:

```bash
# Timestamped report per failed boot: stage, exit code, which PB_* vars were missing,
# and the captured migrate/seed output.
cat ${PB_DOCKER_DIR:-/opt/docker}/pocketbook/data/startup-failures.log
```

The `stage=` field tells you where it died: `validate-env` (a required var is missing —
listed by its resolved name), `wait-for-db` (DB never became reachable — check
`docker logs pocketbook-db`), `prisma-migrate`, or `seed`.

> **`Permission denied` creating `startup-failures.log`?** The container runs as uid 1001, so the
> host data dir must be writable by it. If it isn't, the report falls back to the container-local
> `/tmp/startup-failures.log` (lost on recreate) and startup is unaffected. To keep the log on the
> persistent volume, run on the host:
> `chown -R 1001:1001 ${PB_DOCKER_DIR:-/opt/docker}/pocketbook/data`.

**Optional push alert:** set `PB_ALERT_WEBHOOK` in the panel to a URL that accepts a POSTed
text body (e.g. an ntfy topic `https://ntfy.sh/your-private-topic`) to be notified on each
startup failure. The log file is written regardless of whether this is set.
