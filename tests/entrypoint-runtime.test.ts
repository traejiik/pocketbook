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
