import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const entrypoint = readFileSync('entrypoint.sh', 'utf8')

function commandPosition(command: string): number {
  const position = entrypoint.indexOf(command)
  expect(position, `missing entrypoint command: ${command}`).toBeGreaterThanOrEqual(0)
  return position
}

describe('container entrypoint', () => {
  it('runs the FX backfill after seed and before Next.js', () => {
    const seed = commandPosition('run node /app/prisma/seed.js')
    const backfillStage = commandPosition('STAGE="fx-backfill"')
    const backfill = commandPosition('run node /app/prisma/backfill-fx.js')
    const start = commandPosition('STAGE="start"')

    expect(backfillStage).toBeGreaterThan(seed)
    expect(backfill).toBeGreaterThan(backfillStage)
    expect(start).toBeGreaterThan(backfill)
  })
})
