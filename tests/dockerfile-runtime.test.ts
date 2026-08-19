import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const dockerfile = readFileSync('Dockerfile', 'utf8')
const packageJson = JSON.parse(readFileSync('package.json', 'utf8')) as {
  dependencies: Record<string, string>
}

function runnerStage() {
  const marker = 'FROM node:24-alpine3.22 AS runner'
  const start = dockerfile.indexOf(marker)
  expect(start).toBeGreaterThanOrEqual(0)
  return dockerfile.slice(start)
}

describe('Docker runtime image', () => {
  it('ships Prisma config with the runner so migrate deploy can read the datasource URL', () => {
    expect(runnerStage()).toMatch(
      /COPY --from=builder --chown=nextjs:nodejs \/app\/prisma\.config\.ts \.\/prisma\.config\.ts/,
    )
  })

  it('pins the runner Prisma CLI to the package Prisma version', () => {
    const prismaVersion = packageJson.dependencies.prisma.replace(/^[^\d]*/, '')
    expect(runnerStage()).toContain(`npm install -g prisma@${prismaVersion}`)
  })

  it('ships PostgreSQL 16 clients and the supervised runtime', () => {
    const runner = runnerStage()
    expect(runner).toContain('postgresql16-client')
    expect(runner).toContain('/app/runtime ./runtime')
    expect(dockerfile).toContain('runtime/supervisor.js')
    expect(dockerfile).toContain('runtime/scheduler.js')
  })

  it('boots as root only so the entrypoint can prepare bind mounts', () => {
    const runner = runnerStage()
    expect(runner).toContain('USER root')
    expect(runner).not.toContain('USER nextjs')
    expect(runner).toContain('su-exec')
  })
})
