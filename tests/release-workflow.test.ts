import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const release = readFileSync('.github/workflows/release.yml', 'utf8')
const prCheck = readFileSync('.github/workflows/pr-check.yml', 'utf8')

/** The YAML text of one top-level job, from its key to the next job key. */
function job(name: string) {
  const start = release.indexOf(`\n  ${name}:\n`)
  expect(start).toBeGreaterThan(0)
  const next = release.slice(start + 1).search(/\n  [a-z-]+:\n/)
  return next === -1 ? release.slice(start) : release.slice(start, start + 1 + next)
}

describe('PR checks', () => {
  it('run for pull requests into main and beta', () => {
    expect(prCheck).toMatch(/pull_request:\s*\n\s*branches: \[main, beta\]/)
  })

  it('build the Docker image without pushing it', () => {
    const build = prCheck.indexOf('Build Docker image')
    expect(build).toBeGreaterThan(0)
    expect(prCheck.slice(build)).toMatch(/push: false/)
  })
})

describe('release channels', () => {
  it('runs on pushes to both main and beta', () => {
    expect(release).toMatch(/push:\s*\n\s*branches: \[main, beta\]/)
  })

  it('creates the tag and release only after the image is pushed', () => {
    const create = job('release')
    expect(create).toMatch(/needs: \[plan, docker\]/)
    expect(create).toMatch(/gh release create/)
    expect(job('docker')).not.toMatch(/gh release create/)
  })

  it('never releases from beta', () => {
    const plan = job('plan')
    const beta = plan.indexOf('github.ref_name }}" == "beta"')
    expect(beta).toBeGreaterThan(0)
    expect(plan.slice(beta, plan.indexOf('exit 0', beta))).toMatch(/out release false/)
  })

  it('rejects pre-release versions on main, judging only versions not yet released', () => {
    const plan = job('plan')
    const alreadyReleased = plan.indexOf('gh release view "$TAG"', plan.indexOf('package.json'))
    const reject = plan.indexOf('"$VERSION" == *-*')
    expect(alreadyReleased).toBeGreaterThan(0)
    expect(reject).toBeGreaterThan(alreadyReleased)
  })

  it('keeps stable tags stable-only and beta tags beta-only', () => {
    const tags = job('docker')
    expect(tags).toMatch(/value=latest,enable=\$\{\{ needs\.plan\.outputs\.channel == 'stable' \}\}/)
    expect(tags).toMatch(/value=beta,enable=\$\{\{ needs\.plan\.outputs\.channel == 'beta' \}\}/)
    expect(tags).toMatch(/type=sha,prefix=beta-,enable=\$\{\{ needs\.plan\.outputs\.channel == 'beta' \}\}/)
  })

  it('opens the main → beta sync PR', () => {
    const sync = job('sync-beta')
    expect(sync).toMatch(/github\.ref_name == 'main'/)
    expect(sync).toMatch(/chore\/sync-main-into-beta/)
    expect(sync).toMatch(/gh pr create --base beta/)
  })
})
