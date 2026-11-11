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
  settings?: boolean
  pairs?: { fromCurrency: string; toCurrency: string }[]
  savings?: boolean
}) {
  return {
    appSettings: { findUnique: vi.fn(async () => (opts.settings === false ? null : { id: 'singleton' })) },
    exchangeRate: {
      findMany: vi.fn(async () => opts.pairs ?? DEFAULT_FX_RATES.map(({ fromCurrency, toCurrency }) => ({ fromCurrency, toCurrency }))),
    },
    category: { findFirst: vi.fn(async () => (opts.savings === false ? null : { id: 'sav' })) },
  } as unknown as PrismaClient
}

describe('seedWork', () => {
  it('is empty when non-user bootstrap is complete, even without an owner', async () => {
    expect(await seedWork(fakePrisma({}), { csvPresent: false })).toEqual([])
  })

  it('does not query credentials on an existing database', async () => {
    const prisma = fakePrisma({})
    const lookup = vi.fn(() => { throw new Error('Bootstrap must never read credentials') })
    Object.assign(prisma, { user: { findUnique: lookup } })
    expect(await seedWork(prisma, { csvPresent: false })).toEqual([])
    expect(lookup).not.toHaveBeenCalled()
  })

  it('reports each missing piece', async () => {
    const reasons = await seedWork(
      fakePrisma({ settings: false, pairs: [], savings: false }),
      { csvPresent: true },
    )
    expect(reasons).toEqual([
      'app settings missing',
      `${DEFAULT_FX_RATES.length} default FX pair(s) missing`,
      'savings category missing',
      'bootstrap CSV present',
    ])
  })
})
