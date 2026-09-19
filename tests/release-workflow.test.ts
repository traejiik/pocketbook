import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const release = readFileSync('.github/workflows/release.yml', 'utf8')
const prCheck = readFileSync('.github/workflows/pr-check.yml', 'utf8')

describe('release channels', () => {
  it('runs PR checks for pull requests into main and beta', () => {
    expect(prCheck).toMatch(/pull_request:\s*\n\s*branches: \[main, beta\]/)
  })

  it('cuts releases from pushes to both main and beta', () => {
    expect(release).toMatch(/push:\s*\n\s*branches: \[main, beta\]/)
  })

  it('guards each channel before a release is created', () => {
    const guard = release.indexOf('Enforce release channel')
    const create = release.indexOf('Create release / decide whether to build')
    expect(guard).toBeGreaterThan(0)
    expect(guard).toBeLessThan(create)
    expect(release).toMatch(/"\$BRANCH" == "beta" && ! "\$VERSION" =~ -\(beta\|rc\)/)
    expect(release).toMatch(/"\$BRANCH" == "main" && "\$VERSION" == \*-beta\*/)
  })

  it('keeps latest stable-only and floats a beta tag for beta versions', () => {
    expect(release).toMatch(/value=latest,enable=\$\{\{ needs\.release\.outputs\.prerelease == 'false' \}\}/)
    expect(release).toMatch(/value=beta,enable=\$\{\{ contains\(needs\.release\.outputs\.version, '-beta'\) \}\}/)
  })
})
