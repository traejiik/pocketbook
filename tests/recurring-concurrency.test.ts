import { randomUUID } from 'node:crypto'
import { setTimeout as delay } from 'node:timers/promises'
import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { POST } from '@/app/api/recurring/sync/route'
import { addCycles, formatDateOnly, startOfUtcDay } from '@/lib/recurring/dates'
import { lockRecurringRules } from '@/lib/recurring/locking'
import { prisma } from '@/lib/prisma'
import { deleteCategory } from '@/server-actions/categories'
import { upsertRecurringRule } from '@/server-actions/recurring'
import { syncDueRecurringRulesAction } from '@/server-actions/recurring-sync'
import { upsertTransaction } from '@/server-actions/transactions'

vi.mock('@/lib/auth', () => ({ auth: async () => ({ user: { id: 'test-owner' } }) }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn() }))
vi.mock('@/lib/notifications/instance', () => ({ sendInstanceNotification: vi.fn() }))

// Opt in against a disposable PostgreSQL database with Pocketbook migrations applied.
const databaseUrl = process.env.PB_RECURRING_TEST_DATABASE_URL

describe.runIf(!!databaseUrl)('recurring writers on PostgreSQL', () => {
  let observer: PrismaClient
  let categoryId = ''
  let replacementId = ''
  const cadence = { cycle: 'WEEKLY', cycleInterval: 2, anchorDay: null } as const
  const today = startOfUtcDay(new Date())
  const next = addCycles(cadence, today, 1)

  beforeAll(() => {
    vi.stubEnv('PB_DATABASE_URL', databaseUrl)
    vi.stubEnv('PB_INTERNAL_JOB_TOKEN', 'recurring-test-token')
    observer = new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl }) })
  })

  beforeEach(async () => {
    const category = await observer.category.create({
      data: { name: 'Recurring test ' + randomUUID(), kind: 'EXPENSE', color: '#000000' },
    })
    categoryId = category.id
  })

  afterEach(async () => {
    const ids = [categoryId, replacementId].filter(Boolean)
    if (ids.length === 0) return
    await observer.transaction.deleteMany({ where: { categoryId: { in: ids } } })
    await observer.recurringRule.deleteMany({ where: { categoryId: { in: ids } } })
    await observer.category.deleteMany({ where: { id: { in: ids } } })
    categoryId = ''
    replacementId = ''
  })

  afterAll(async () => {
    await Promise.all([observer.$disconnect(), prisma.$disconnect()])
    vi.unstubAllEnvs()
  })

  function createRule() {
    return observer.recurringRule.create({
      data: { ...cadence, name: 'Recurring test', categoryId, kind: 'EXPENSE', amount: 4200, currency: 'HUF', nextDue: today },
    })
  }

  function readRule(id: string) {
    return observer.recurringRule.findUniqueOrThrow({
      where: { id },
      include: { transactions: { select: { date: true, coversDueDate: true } } },
    })
  }

  function scheduledSync() {
    return POST(new Request('http://localhost/api/recurring/sync', {
      method: 'POST',
      headers: { 'x-internal-job-token': 'recurring-test-token' },
    })).then((response) => response.json())
  }

  async function waitForRuleLockWaiters(count: number) {
    const deadline = Date.now() + 2_500
    while (Date.now() < deadline) {
      const [{ waiting }] = await observer.$queryRaw<{ waiting: number }[]>`
        SELECT COUNT(*)::int AS waiting
        FROM pg_stat_activity
        WHERE datname = current_database()
          AND wait_event_type = 'Lock'
          AND (query LIKE '%FROM "RecurringRule"%FOR UPDATE%' OR query LIKE '%UPDATE%"RecurringRule"%')
      `
      if (waiting >= count) return
      await delay(20)
    }
    throw new Error(`Expected ${count} PostgreSQL sessions to be waiting for the rule lock`)
  }

  async function overlap<A, B>(id: string, first: () => Promise<A>, second: () => Promise<B>) {
    const acquired = Promise.withResolvers<void>()
    const release = Promise.withResolvers<void>()
    const holder = observer.$transaction(async (tx) => {
      await lockRecurringRules(tx, [id])
      acquired.resolve()
      await release.promise
    }, { timeout: 10_000 })
    const started: Promise<unknown>[] = []
    try {
      await Promise.race([acquired.promise, holder])
      const firstResult = first()
      started.push(firstResult)
      await waitForRuleLockWaiters(1)
      const secondResult = second()
      started.push(secondResult)
      await waitForRuleLockWaiters(2)
      release.resolve()
      return await Promise.all([firstResult, secondResult] as const)
    } finally {
      release.resolve()
      await Promise.allSettled([holder, ...started])
    }
  }

  it('generates one occurrence across the scheduled route and app-open action', async () => {
    const rule = await createRule()
    const [scheduled, appOpen] = await overlap(rule.id, scheduledSync, syncDueRecurringRulesAction)

    expect(scheduled.transactionsCreated + appOpen.transactionsCreated).toBe(1)
    expect(await readRule(rule.id)).toMatchObject({
      nextDue: next,
      transactions: [{ date: today, coversDueDate: null }],
    })
  })

  it('uses the edited cadence when a waiting sync rereads the rule', async () => {
    const rule = await createRule()
    const [edited, synced] = await overlap(rule.id, () => upsertRecurringRule({
      id: rule.id, name: rule.name, kind: 'EXPENSE', categoryId, amount: 4200, currency: 'HUF',
      cycle: 'WEEKLY', cycleInterval: 3, nextDue: formatDateOnly(today),
      scheduleSnapshot: { ...cadence, nextDue: formatDateOnly(today) },
    }), syncDueRecurringRulesAction)

    expect(edited).toEqual({ ok: true })
    expect(synced.transactionsCreated).toBe(1)
    expect(await readRule(rule.id)).toMatchObject({
      cycleInterval: 3,
      nextDue: addCycles({ ...cadence, cycleInterval: 3 }, today, 1),
      transactions: [{ date: today, coversDueDate: null }],
    })
  })

  it('rejects a stale cadence edit after the waiting sync advances the schedule', async () => {
    const rule = await createRule()
    const [synced, edited] = await overlap(rule.id, syncDueRecurringRulesAction, () => upsertRecurringRule({
      id: rule.id, name: rule.name, kind: 'EXPENSE', categoryId, amount: 4200, currency: 'HUF',
      cycle: 'WEEKLY', cycleInterval: 3, nextDue: formatDateOnly(today),
      scheduleSnapshot: { ...cadence, nextDue: formatDateOnly(today) },
    }))

    expect(synced.transactionsCreated).toBe(1)
    expect(edited).toEqual({ error: expect.stringMatching(/reload/i) })
    expect(await readRule(rule.id)).toMatchObject({
      cycleInterval: 2,
      nextDue: next,
      transactions: [{ date: today, coversDueDate: null }],
    })
  })

  it('reassigns a category during a concurrent linked transaction edit', async () => {
    const replacement = await observer.category.create({
      data: { name: 'Recurring replacement ' + randomUUID(), kind: 'EXPENSE', color: '#000000' },
    })
    replacementId = replacement.id
    const rule = await createRule()
    const payment = await observer.transaction.create({
      data: {
        date: today, description: rule.name, amount: -4200, currency: 'HUF', type: 'EXPENSE',
        categoryId, recurringRuleId: rule.id,
      },
    })

    const [edited] = await overlap(rule.id, () => upsertTransaction({
      id: payment.id, date: formatDateOnly(today), description: 'Edited payment', type: 'EXPENSE',
      categoryId, amount: 4300, currency: 'HUF', recurringRuleId: rule.id,
    }), () => deleteCategory(categoryId, replacementId))

    expect(edited).toEqual({ ok: true })
    expect(await observer.category.findUnique({ where: { id: categoryId } })).toBeNull()
    expect(await readRule(rule.id)).toMatchObject({ categoryId: replacementId })
    expect(await observer.transaction.findUnique({ where: { id: payment.id } })).toMatchObject({
      categoryId: replacementId, recurringRuleId: rule.id, description: 'Edited payment',
    })
  })

  it.each([true, false])('creates one claim when early settlement wins the lock = %s', async (earlyFirst) => {
    const rule = await createRule()
    const paidOn = new Date(today.getTime() - 86_400_000)
    const early = () => upsertTransaction({
      date: formatDateOnly(paidOn), description: rule.name, type: 'EXPENSE', categoryId, amount: 4200, currency: 'HUF',
      recurringRuleId: rule.id, logEarly: true, expectedDueDate: formatDateOnly(today),
    })
    const [settled, synced] = earlyFirst
      ? await overlap(rule.id, early, syncDueRecurringRulesAction)
      : (await overlap(rule.id, syncDueRecurringRulesAction, early)).toReversed()

    expect(settled).toEqual(earlyFirst ? { ok: true } : { error: expect.stringMatching(/reload/i) })
    expect(synced).toMatchObject({ transactionsCreated: earlyFirst ? 0 : 1 })
    expect(await readRule(rule.id)).toMatchObject({
      nextDue: next,
      transactions: earlyFirst
        ? [{ date: paidOn, coversDueDate: today }]
        : [{ date: today, coversDueDate: null }],
    })
  })
})
