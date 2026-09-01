# Pocketbook — Homelab Deployment Runbook

Stack: Next.js 16 · React 19 · Node 24 Alpine · PostgreSQL 16 · Docker Compose · nginx-proxy-manager

## Topology

Production has exactly two services:

- `pocketbook-web` — Next.js plus a separately supervised UTC scheduler worker. The image also contains PostgreSQL 16 client tools for backups.
- `pocketbook-db` — PostgreSQL 16.

Keep one web replica. A second replica would start a second scheduler; horizontal scaling requires leader election and is intentionally unsupported.

The web supervisor generates a 256-bit token on each boot and shares it only with its two child processes. The worker uses that token to call the FX, monthly-insight, and recurring route handlers, keeping their cache invalidation inside Next.js. There is no external cron secret.

## Portainer environment

Paste `stack.env.example` into Stack → Environment variables → Advanced mode.

Required:

| Key | Example |
| --- | --- |
| `PB_AUTH_URL` | `https://pocketbook.yourdomain.com` |
| `PB_AUTH_SECRET` | output of `openssl rand -base64 32` |
| `PB_SEED_USER_EMAIL` | `you@yourdomain.com` |
| `PB_SEED_USER_PASSWORD` | a strong password |
| `PB_POSTGRES_PASSWORD` | output of `openssl rand -hex 32` |

Optional:

| Key | Default |
| --- | --- |
| `PB_USER_DISPLAY_NAME` | `Pocketbook` |
| `PB_INSTANCE_NAME` | empty |
| `PB_OLLAMA_BASE_URL` | `http://ollama:11434` |
| `PB_DOCKER_DIR` | `/opt/docker` |
| `PB_LOG_LEVEL` | `info` (`debug` \| `info` \| `warn` \| `error` \| `silent`) |
| `PB_LOG_FORMAT` | `pretty` (or `json`) |
| `PB_LOG_REQUESTS` | on (`0` disables per-request lines) |

Do not add a Discord webhook, alert webhook, or scheduler secret to Portainer. Discord is configured only after authentication in Settings → Notifications.

## Persistent directories

Create the host directories if your Docker deployment does not create bind-mount sources automatically:

```bash
mkdir -p /opt/docker/pocketbook/{postgres,data,backups}
```

The image briefly starts its entrypoint as root to make `/data` and `/backups` writable by UID 1001, then re-execs as `nextjs`. All migrations, seed work, Next.js, scheduler jobs, and PostgreSQL client processes run unprivileged.

`/data` contains:

- `.env-cache` — last-known-good validated environment values, mode `0600`.
- `notifications.json` — the production Discord configuration file, mode `0600`.
- `jobs/<job>.json` — atomic occurrence and retry state.
- `last-backup.json` — structured backup health and last verified metadata.
- `startup-failures.log` — pre-supervisor startup diagnostics.

`/backups` contains verified `pocketbook-YYYYMMDD-HHMMSS.dump` archives.

## First deployment and upgrades

```bash
docker compose pull
docker compose up -d --remove-orphans
docker compose ps
docker compose logs -f pocketbook-web
```

`--remove-orphans` removes the former scheduler and backup sidecar containers while preserving the host-mounted database, data, and backup directories.

On each boot, `pocketbook-web` waits for PostgreSQL, runs `prisma migrate deploy`, the idempotent seed, and the FX-lock backfill. It then starts the supervisor. If Next.js exits, the worker exits, or worker heartbeats stop, the supervisor terminates its sibling and exits so Docker restarts the service.

After one successful boot, missing environment values can be filled from `/data/.env-cache`; live environment values always win. Discord is never read from or copied into this cache.

## Scheduled operations

The worker evaluates fixed UTC schedules once per minute and runs due work serially:

| Job | Schedule | Setting |
| --- | --- | --- |
| Verified PostgreSQL backup | daily 02:30 | always |
| Frankfurter FX sync | daily 03:00 | `fxAutoSync` |
| Closed-month AI insight | day 1 at 03:05 | `autoInsightsMonthly` |
| Recurring reconciliation | daily 03:10 | always |

On startup, Pocketbook catches up only the latest relevant state: the current backup, current FX state, latest closed-month insight, and idempotent recurring reconciliation. It does not replay every missed date. A missing successful occurrence retries every 15 minutes; only its first failure attempts a Discord failure notification.

Operational state is atomic under `/data/jobs`. If a state file is missing or corrupt, the latest occurrence is safely reconsidered; finance writes and recurring generation remain idempotent.

## Discord notifications

1. In Discord, create a webhook and copy its HTTPS URL.
2. Sign in to Pocketbook and open Settings → Notifications.
3. Enter the webhook, optional username and public HTTPS avatar URL, and choose event switches.
4. Select **Send test**. The test uses those current unsaved identity fields and bypasses the master/event switches.
5. After the test succeeds, select **Save settings** within ten minutes.

Discord identity means the webhook URL, username, and avatar URL together. A new or changed identity must pass one successful test before Save persists it. A successful test returns a process-local signed receipt that expires after ten minutes and is held only in browser memory until Save, expiry, an identity edit, or Disconnect. A web-process restart invalidates an outstanding unsaved receipt, so run Send test again; verification already persisted with a saved identity survives restarts. Save validates that proof and sends no second Discord message. Master/event switch-only changes keep the already verified identity and can save without another test. The card's layout is otherwise unchanged: there are no verification badges, status rows, or extra helper panels.

The authenticated Settings page displays the saved webhook in an editable URL field and keeps it visible after Save. Treat it as a credential: anyone holding it can post to the Discord channel. Pocketbook does not log it, include it in toasts or errors, or expose it to unauthenticated clients. Disconnect removes the stored webhook and verification from `/data/notifications.json` and clears the current browser proof. A valid receipt is neither globally revoked nor single-use; its short expiry, signature, and exact identity binding are the security boundary. Discord requests disable mentions, use `wait=true`, and time out after five seconds. Notification failures never roll back finance or backup work.

Production uses `/data/notifications.json`. Direct development runs use the repository-local `.data/notifications.json`, which Git ignores. `PB_NOTIFICATION_CONFIG_PATH` is an explicit path override for development or diagnostics; it selects the file location but is not a webhook environment fallback.

Existing v1 notification files continue delivering after upgrade and migrate to the v2 schema in memory with no stored verification. Schema migration is separate from identity trust: explicit Test + Save can preserve the legacy identity into a verified v2 file, while Disconnect may instead write an unconfigured v2 file. An old identity is never silently marked trusted. Notification writes and Disconnect are serialised inside the web process, which relies on the supported single-`pocketbook-web`-replica topology described above.

The optional avatar remains a direct public HTTPS URL attached per outgoing message. Pocketbook never uploads it, uses ImgBB, or modifies the shared Discord webhook's default avatar.

The six event switches are system alerts, scheduled-job failures, recurring activity, monthly insight ready, backup completed, and backup failed. Messages are fixed typed presets with live values; templates and arbitrary payloads are intentionally unsupported.

## Database backups

Scheduled and manual backups share one implementation. It acquires a cross-process lock, runs `pg_dump` without a shell, passes the password only in the child environment, writes a `.partial` custom-format archive, verifies it with `pg_restore --list`, then atomically renames it to `.dump`. The newest 14 verified archives are retained. A run times out after 30 minutes; stale locks and partials are recovered safely.

Settings → Database backups shows Healthy, Failed, or Never, plus last success, filename, size, retained count, next run, and an authenticated Back up now action. A failed attempt preserves the metadata for the last known-good archive.

### Restore drill

Never test a restore against the live `pocketbook` database. Restore into a disposable database and compare representative counts:

```bash
# Choose an existing verified archive.
BACKUP_FILE=pocketbook-YYYYMMDD-HHMMSS.dump

# Create a disposable target.
docker compose exec pocketbook-db createdb -U pocketbook pocketbook_restore_drill

# Restore from the /backups mount available inside pocketbook-web.
docker compose exec pocketbook-web sh -lc \
  'PGPASSWORD="$PB_POSTGRES_PASSWORD" pg_restore \
    --host=pocketbook-db --username=pocketbook \
    --dbname=pocketbook_restore_drill "/backups/'"$BACKUP_FILE"'"'

# Compare representative row counts with the live database.
docker compose exec pocketbook-db psql -U pocketbook -d pocketbook -c \
  'select count(*) as live_transactions from "Transaction";'
docker compose exec pocketbook-db psql -U pocketbook -d pocketbook_restore_drill -c \
  'select count(*) as restored_transactions from "Transaction";'

# Remove only the disposable target after verification.
docker compose exec pocketbook-db dropdb -U pocketbook pocketbook_restore_drill
```

For an intentional real restore, stop the web service first, explicitly name the target database, take a fresh safety dump, and review the `pg_restore` flags. Pocketbook deliberately provides no restore button.

## Application logs

The web container logs every meaningful action to stdout, so `docker logs` is the primary diagnostic surface: sign-ins, requests, mutations, scheduled job outcomes, model generations, notification delivery, and errors. One event per line — timestamp, level, `[scope]`, then `key=value` fields.

| Scope | What it covers |
| --- | --- |
| `boot` | one startup banner: image version, Node, timezone, log settings, Ollama URL |
| `http` | one line per request that reaches the app (prefetches drop to `debug`) |
| `auth` | sign-in success and failure (never the password) |
| `db` | connection state |
| `transactions`, `recurring`, `categories`, `settings`, `import` | every mutation, with the values written |
| `insights`, `ollama` | generation lifecycle: prompt size, time to first token, token counts, `done_reason`, retries |
| `fx`, `notifications`, `backup` | rate syncs, Discord delivery outcomes, backup runs |
| `jobs`, `scheduler`, `supervisor` | scheduled occurrences, ticks, child process starts and exits |
| `error` | anything Next.js caught on the server, with the route it surfaced on |

```bash
docker logs -f pocketbook-web | grep '\[ollama\]'          # why a note was slow or empty
docker logs pocketbook-web | grep -E 'WARN|ERROR'           # only the problems
docker logs --since 30m pocketbook-web | grep '\[jobs\]'   # what the scheduler did
```

Warnings and errors go to stderr, everything else to stdout; errors carry an indented stack trace on the following lines. Secrets are redacted by field name and by pattern (passwords, `*token`, `*secret`, Discord webhook URLs), but transaction amounts and descriptions are logged verbatim — redact before sharing the output.

Set `PB_LOG_LEVEL=debug` while troubleshooting (prompt sizes, a 200-character preview of each generated note, per-pair FX updates, skipped notifications), `PB_LOG_LEVEL=warn` for a quiet instance, and `PB_LOG_FORMAT=json` when shipping into a log collector. `PB_LOG_REQUESTS=0` silences the per-request lines without touching the rest.

## Useful commands

```bash
docker compose logs -f pocketbook-web
docker compose logs -f pocketbook-db
docker compose ps
docker compose config
docker compose down                 # bind-mounted data persists
```

Avoid `docker compose down -v` unless you have confirmed the exact storage layout and intend to remove named volumes.

## Troubleshooting

| Symptom | Check |
| --- | --- |
| Login fails | `PB_AUTH_URL` and `PB_AUTH_SECRET` in Portainer |
| `validate-env` restart loop | required values missing from both Portainer and `/data/.env-cache` |
| `prisma-migrate` failure | `/data/startup-failures.log` and PostgreSQL health |
| Scheduler repeatedly exits | `docker compose logs pocketbook-web`; supervisor exits the whole service by design |
| Internal route returns 401 | only the worker can call it; a stale process or manual HTTP request has no current per-boot token |
| Backup says already running forever | upgrade to v2.11.0+ for stale-lock recovery; inspect `/tmp/pocketbook-backup.lock` inside the current container |
| Backup failed | Settings error, web logs, database reachability, and host free space |
| Insight is blank or slow | `docker logs pocketbook-web \| grep '[ollama]'` — check `doneReason`, `outputTokens`, `ttftMs`, and connection retries |
| Nothing in the log but the banner | `PB_LOG_LEVEL` set to `warn`/`error`/`silent`, or nothing has happened yet |
| Discord test fails | exact `https://discord.com/api/webhooks/...` URL, public avatar reachability, Discord permissions |
| Notifications disappeared after redeploy | confirm the `/data` bind mount persists and contains `notifications.json` owned by UID 1001 |

Startup failures before the supervisor are appended to `${PB_DOCKER_DIR}/pocketbook/data/startup-failures.log`. Runtime child failures are visible in `pocketbook-web` logs and use the configured system-alert preset when enabled.
