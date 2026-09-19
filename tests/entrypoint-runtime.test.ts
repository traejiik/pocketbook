import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const entrypoint = readFileSync('entrypoint.sh', 'utf8')

function commandPosition(command: string): number {
  const position = entrypoint.indexOf(command)
  expect(position, `missing entrypoint command: ${command}`).toBeGreaterThanOrEqual(0)
  return position
}

describe('container entrypoint', () => {
  it('runs the FX backfill after seed and before the supervisor', () => {
    const seed = commandPosition('run node /app/prisma/seed.js')
    const backfillStage = commandPosition('STAGE="fx-backfill"')
    const backfill = commandPosition('run node /app/prisma/backfill-fx.js')
    const start = commandPosition('STAGE="start"')

    expect(backfillStage).toBeGreaterThan(seed)
    expect(backfill).toBeGreaterThan(backfillStage)
    expect(start).toBeGreaterThan(backfill)
    expect(entrypoint).toContain('exec node /app/runtime/supervisor.js')
  })

  it('runs each bootstrap step only when its check says it is needed', () => {
    const migrateCheck = commandPosition('if needs migrations; then')
    const migrate = commandPosition('run prisma migrate deploy')
    const seedCheck = commandPosition('if needs seed; then')
    const seed = commandPosition('run node /app/prisma/seed.js')
    const backfillCheck = commandPosition('if needs fx-backfill; then')
    const backfill = commandPosition('run node /app/prisma/backfill-fx.js')

    expect(migrate).toBeGreaterThan(migrateCheck)
    expect(seedCheck).toBeGreaterThan(migrate)
    expect(seed).toBeGreaterThan(seedCheck)
    expect(backfillCheck).toBeGreaterThan(seed)
    expect(backfill).toBeGreaterThan(backfillCheck)
    expect(entrypoint).toContain('run node /app/prisma/bootstrap-check.js "$1"')
  })

  it('treats exit 10 as needed, 0 as skip, and aborts on any other check result', () => {
    expect(entrypoint).toContain('[ "$rc" -eq 10 ] && return 0')
    expect(entrypoint).toContain('[ "$rc" -eq 0 ] && return 1')
    expect(entrypoint).toMatch(/bootstrap check for \$1 failed[\s\S]*?exit "\$rc"/)
  })

  it('lets PB_FORCE_BOOTSTRAP force every step', () => {
    expect(entrypoint).toContain('if [ "${PB_FORCE_BOOTSTRAP:-0}" = "1" ]; then')
  })

  it('drops from root to UID 1001 before application startup', () => {
    const bootstrap = commandPosition('if [ "$(id -u)" -eq 0 ]')
    const drop = commandPosition('exec su-exec nextjs:nodejs "$0" "$@"')
    const migrate = commandPosition('STAGE="prisma-migrate"')

    expect(drop).toBeGreaterThan(bootstrap)
    expect(migrate).toBeGreaterThan(drop)
    expect(entrypoint).toContain('umask 077')
    expect(entrypoint).toContain('chmod 700 /data /backups')
  })

  it('does not cache or read notification webhooks or an external sync secret', () => {
    expect(entrypoint).not.toMatch(/PB_DISCORD_WEBHOOK|PB_ALERT_WEBHOOK|PB_FX_SYNC_SECRET|FX_SYNC_SECRET/)
  })
})
