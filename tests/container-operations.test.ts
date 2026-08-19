import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const compose = readFileSync('docker-compose.yml', 'utf8')
const dockerignore = readFileSync('.dockerignore', 'utf8')

describe('integrated operations compose topology', () => {
  it('contains only the database and web services', () => {
    const services = [...compose.matchAll(/^  ([a-z0-9-]+):$/gm)].map((match) => match[1])
    expect(services).toEqual(['pocketbook-db', 'pocketbook-web'])
  })

  it('keeps both operational directories persistent on the web service', () => {
    expect(compose).toContain('/pocketbook/data:/data')
    expect(compose).toContain('/pocketbook/backups:/backups')
  })

  it('passes no notification webhook or scheduler secret from the environment', () => {
    expect(compose).not.toMatch(/PB_DISCORD_WEBHOOK|PB_ALERT_WEBHOOK|PB_FX_SYNC_SECRET|FX_SYNC_SECRET/)
  })

  it('keeps local dependencies, builds, git data, and environment files out of the image context', () => {
    expect(dockerignore).toMatch(/^node_modules$/m)
    expect(dockerignore).toMatch(/^\.next$/m)
    expect(dockerignore).toMatch(/^\.git$/m)
    expect(dockerignore).toMatch(/^\.env\*$/m)
  })
})
