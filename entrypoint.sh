#!/bin/sh
set -e

# ---------------------------------------------------------------------------
# Startup failure capture
#
# On a crash-restart loop the console scrolls and `docker logs` is wiped on a
# Watchtower/Portainer recreate, so the cause is easy to miss. Before exiting on
# failure we append a timestamped report to a file on the persistent /data
# volume, readable on the host at:
#   ${PB_DOCKER_DIR}/pocketbook/data/startup-failures.log
# Optionally also POSTs to PB_ALERT_WEBHOOK (e.g. an ntfy topic) for a push.
# The success path execs into Next.js, so this trap only ever fires on failure.
# ---------------------------------------------------------------------------
FAIL_LOG="${PB_FAIL_LOG:-/data/startup-failures.log}"
# /data is a bind mount; if the host dir isn't writable by this uid (1001) the
# persistent log can't be created. Fall back to /tmp so a diagnostic is never
# lost. (To keep it across container recreation, chown the host dir to 1001.)
if ! : >> "$FAIL_LOG" 2>/dev/null; then FAIL_LOG=/tmp/startup-failures.log; fi
RUN_LOG="/tmp/pb-startup.$$"
STEP="/tmp/pb-step.$$"
STAGE="init"
if ! : > "$RUN_LOG" 2>/dev/null; then RUN_LOG=/dev/null; STEP=/dev/null; fi

# echo to console AND this run's capture buffer
say() { echo "$@"; echo "$@" >> "$RUN_LOG" 2>/dev/null || true; }

# run a command; mirror its output to console + buffer; preserve its exit code
run() {
  if "$@" > "$STEP" 2>&1; then rc=0; else rc=$?; fi
  cat "$STEP" 2>/dev/null || true
  cat "$STEP" >> "$RUN_LOG" 2>/dev/null || true
  return "$rc"
}

on_exit() {
  code=$?
  [ "$code" -eq 0 ] && return 0
  ts="$(date -u '+%Y-%m-%dT%H:%M:%SZ' 2>/dev/null || echo unknown)"
  {
    echo "==================================================================="
    echo "[$ts] pocketbook-web STARTUP FAILED — stage=$STAGE exit=$code"
    echo "Required variables (resolved; pass the bare name via compose OR the PB_ name via the Portainer panel):"
    for v in AUTH_URL AUTH_SECRET PB_POSTGRES_PASSWORD SEED_USER_EMAIL SEED_USER_PASSWORD; do
      eval "val=\${$v}"
      [ -n "$val" ] && echo "  $v = set" || echo "  $v = MISSING"
    done
    echo "Output:"
    sed 's/^/  /' "$RUN_LOG" 2>/dev/null || echo "  (no captured output)"
    echo ""
  } >> "$FAIL_LOG" 2>/dev/null \
    && echo "Startup failed (stage=$STAGE, exit=$code). Report appended to $FAIL_LOG" >&2 \
    || echo "Startup failed (stage=$STAGE, exit=$code). Could not write $FAIL_LOG — is /data writable by uid 1001?" >&2

  # Optional push notification: set PB_ALERT_WEBHOOK to a URL that accepts a
  # POSTed text body (e.g. https://ntfy.sh/your-topic). Best-effort, time-boxed.
  if [ -n "$PB_ALERT_WEBHOOK" ]; then
    node -e "const u=process.env.PB_ALERT_WEBHOOK,h=require(u.indexOf('https')===0?'https':'http'),d='pocketbook-web startup FAILED: stage=$STAGE exit=$code';const r=h.request(u,{method:'POST'},()=>process.exit(0));r.setTimeout(3000,()=>process.exit(0));r.on('error',()=>process.exit(0));r.end(d);" 2>/dev/null || true
  fi

  # Optional Discord notification: set PB_DISCORD_WEBHOOK to a Discord webhook
  # URL. Discord requires a JSON body, hence the separate variable and payload.
  if [ -n "$PB_DISCORD_WEBHOOK" ]; then
    node -e "const u=process.env.PB_DISCORD_WEBHOOK,h=require(u.indexOf('https')===0?'https':'http'),b=JSON.stringify({content:'🛑 pocketbook-web startup FAILED: stage=$STAGE exit=$code'});const r=h.request(u,{method:'POST',headers:{'Content-Type':'application/json','Content-Length':Buffer.byteLength(b)}},()=>process.exit(0));r.setTimeout(3000,()=>process.exit(0));r.on('error',()=>process.exit(0));r.end(b);" 2>/dev/null || true
  fi
}
trap on_exit EXIT

# ---------------------------------------------------------------------------
# Resolve config to the bare names the app + Auth.js read (AUTH_URL, AUTH_SECRET,
# SEED_USER_*, FX_SYNC_SECRET, OLLAMA_BASE_URL). Accept either form:
#   - a bare name passed straight through by compose (e.g. AUTH_URL=...), or
#   - the PB_-prefixed name from the Portainer panel (e.g. PB_AUTH_URL=...).
# A bare name that's already set wins; otherwise fall back to its PB_ counterpart.
# ---------------------------------------------------------------------------
STAGE="map-env"
export AUTH_URL="${AUTH_URL:-$PB_AUTH_URL}"
export AUTH_SECRET="${AUTH_SECRET:-$PB_AUTH_SECRET}"
export FX_SYNC_SECRET="${FX_SYNC_SECRET:-$PB_FX_SYNC_SECRET}"
export OLLAMA_BASE_URL="${OLLAMA_BASE_URL:-$PB_OLLAMA_BASE_URL}"
export SEED_USER_EMAIL="${SEED_USER_EMAIL:-$PB_SEED_USER_EMAIL}"
export SEED_USER_PASSWORD="${SEED_USER_PASSWORD:-$PB_SEED_USER_PASSWORD}"
export PB_POSTGRES_PASSWORD="${PB_POSTGRES_PASSWORD:-$POSTGRES_PASSWORD}"

# Fail fast with one clear message listing every missing required var.
STAGE="validate-env"
missing=""
[ -z "$AUTH_URL" ] && missing="$missing AUTH_URL/PB_AUTH_URL"
[ -z "$AUTH_SECRET" ] && missing="$missing AUTH_SECRET/PB_AUTH_SECRET"
[ -z "$PB_POSTGRES_PASSWORD" ] && missing="$missing PB_POSTGRES_PASSWORD"
[ -z "$SEED_USER_EMAIL" ] && missing="$missing SEED_USER_EMAIL/PB_SEED_USER_EMAIL"
[ -z "$SEED_USER_PASSWORD" ] && missing="$missing SEED_USER_PASSWORD/PB_SEED_USER_PASSWORD"
if [ -n "$missing" ]; then
  say "ERROR: missing required variables (set them in the Portainer stack environment panel):"
  say "  $missing"
  say "Either name form works: pass the bare name via compose, or the PB_ name via the panel. See DEPLOY.md."
  exit 1
fi

export PB_DATABASE_URL="postgresql://${PB_POSTGRES_USER}:${PB_POSTGRES_PASSWORD}@pocketbook-db:5432/${PB_POSTGRES_DB}"

# Wait for Postgres to accept TCP connections. depends_on: service_healthy only
# gates `compose up`, not restart-policy restarts after a reboot/Watchtower recreate.
STAGE="wait-for-db"
say "Waiting for database..."
i=0
until node -e "const s=require('net').createConnection(5432,'pocketbook-db');s.setTimeout(2000);s.on('connect',()=>{s.end();process.exit(0)});s.on('timeout',()=>process.exit(1));s.on('error',()=>process.exit(1))" 2>/dev/null; do
  i=$((i+1))
  if [ "$i" -ge 30 ]; then
    say "ERROR: database not reachable after 60s (check: docker logs pocketbook-db)."
    exit 1
  fi
  sleep 2
done
say "Database is up."

STAGE="prisma-migrate"
say "Running Prisma migrations..."
run prisma migrate deploy

STAGE="seed"
say "Seeding database..."
run node /app/prisma/seed.js

STAGE="start"
say "Starting Next.js..."
exec node /app/server.js
