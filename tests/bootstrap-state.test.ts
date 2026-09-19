import bcrypt from 'bcryptjs'
import { describe, expect, it, vi } from 'vitest'
import type { PrismaClient } from '@prisma/client'
import { DEFAULT_FX_RATES, pendingMigrations, seedWork } from '../prisma/bootstrap-state'

const done = (name: string) => ({ migration_name: name, finished_at: new Date(), rolled_back_at: null })

describe('pendingMigrations', () => {
  it('reports nothing when every folder has a finished row', () => {
    expect(pendingMigrations(['a', 'b'], [done('a'), done('b')])).toEqual({ pending: [], failed: [] })
  })

  it('lists folders with no successful row, sorted', () => {
    expect(pendingMigrations(['c', 'a', 'b'], [done('a')]).pending).toEqual(['b', 'c'])
  })

  it('treats a rolled-back row as not applied', () => {
    const rolledBack = { migration_name: 'a', finished_at: null, rolled_back_at: new Date() }
    expect(pendingMigrations(['a'], [rolledBack])).toEqual({ pending: ['a'], failed: [] })
  })

  it('flags a started-but-unfinished migration so deploy can surface it', () => {
    const stuck = { migration_name: 'a', finished_at: null, rolled_back_at: null }
    expect(pendingMigrations(['a'], [stuck])).toEqual({ pending: ['a'], failed: ['a'] })
  })
})

function fakePrisma(opts: {
  passwordHash?: string | null
  settings?: boolean
  pairs?: { fromCurrency: string; toCurrency: string }[]
  savings?: boolean
}) {
  return {
    user: { findUnique: vi.fn(async () => (opts.passwordHash ? { passwordHash: opts.passwordHash } : null)) },
    appSettings: { findUnique: vi.fn(async () => (opts.settings === false ? null : { id: 'singleton' })) },
    exchangeRate: {
      findMany: vi.fn(async () => opts.pairs ?? DEFAULT_FX_RATES.map(({ fromCurrency, toCurrency }) => ({ fromCurrency, toCurrency }))),
    },
    category: { findFirst: vi.fn(async () => (opts.savings === false ? null : { id: 'sav' })) },
  } as unknown as PrismaClient
}

describe('seedWork', () => {
  const password = 'correct horse'
  const passwordHash = bcrypt.hashSync(password, 4)
  const base = { email: 'me@example.com', password, csvPresent: false }

  it('is empty when every seed invariant already holds', async () => {
    expect(await seedWork(fakePrisma({ passwordHash }), base)).toEqual([])
  })

  it('re-seeds when the env password no longer matches the stored hash', async () => {
    expect(await seedWork(fakePrisma({ passwordHash }), { ...base, password: 'rotated' }))
      .toEqual(['seed user password changed'])
  })

  it('reports each missing piece', async () => {
    const reasons = await seedWork(
      fakePrisma({ passwordHash: null, settings: false, pairs: [], savings: false }),
      { ...base, csvPresent: true },
    )
    expect(reasons).toEqual([
      'seed user missing',
      'app settings missing',
      `${DEFAULT_FX_RATES.length} default FX pair(s) missing`,
      'savings category missing',
      'bootstrap CSV present',
    ])
  })
})
