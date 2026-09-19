import { readFileSync, readdirSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

// A `'use server'` module may only export async functions. Everything else is
// rewritten by Next's server-actions loader into a runtime re-export, which
// throws `ReferenceError: <name> is not defined` the moment the module is
// evaluated — a crash neither `tsc` nor `next build` catches, because the module
// is only evaluated when the page runs. `export type { X }` is erased by tsc but
// NOT by the loader, so it is banned here too: declare shared types in `lib/`.
const FILES = readdirSync('server-actions').filter((f) => f.endsWith('.ts'))

const ALLOWED = [
  /^export\s+async\s+function\s/,       // the actions themselves
  /^export\s+type\s+\w+\s*=/,           // a type alias declared here
  /^export\s+interface\s+\w+/,
]

describe('server actions only export async functions', () => {
  it.each(FILES)('%s', (file) => {
    const source = readFileSync(`server-actions/${file}`, 'utf8')
    expect(source.startsWith("'use server'")).toBe(true)

    const offenders = source
      .split('\n')
      .map((line, i) => ({ line: line.trim(), n: i + 1 }))
      .filter(({ line }) => line.startsWith('export') && !ALLOWED.some((re) => re.test(line)))

    expect(offenders, `server-actions/${file} exports a non-action value`).toEqual([])
  })
})
