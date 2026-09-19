import { beforeEach, describe, expect, it, vi } from 'vitest'

const authMock = vi.fn()
const revalidatePathMock = vi.fn()
const revalidateTagMock = vi.fn()
const categoryCreate = vi.fn()
const categoryUpdate = vi.fn()

vi.mock('@/lib/auth', () => ({ auth: authMock }))
vi.mock('next/cache', () => ({
  revalidatePath: revalidatePathMock,
  revalidateTag: revalidateTagMock,
}))
vi.mock('@/lib/prisma', () => ({
  prisma: { category: { create: categoryCreate, update: categoryUpdate } },
}))

const base = { name: 'Transfers', color: '#8E97A8', kind: 'EXPENSE' as const }

describe('upsertCategory and the balance flag', () => {
  beforeEach(() => {
    vi.resetModules()
    authMock.mockResolvedValue({ user: { id: 'user-1' } })
    categoryCreate.mockResolvedValue({})
    categoryUpdate.mockResolvedValue({})
  })

  it('stores includeInBalance when a category is toggled out of the balance', async () => {
    const { upsertCategory } = await import('@/server-actions/categories')

    await upsertCategory({ id: 'cat-1', ...base, includeInBalance: false })

    expect(categoryUpdate).toHaveBeenCalledWith({
      where: { id: 'cat-1' },
      data: { ...base, includeInBalance: false },
    })
  })

  it('defaults new categories to counting toward the balance', async () => {
    const { upsertCategory } = await import('@/server-actions/categories')

    await upsertCategory(base)

    expect(categoryCreate).toHaveBeenCalledWith({ data: { ...base, includeInBalance: true } })
  })

  it('invalidates the categories tag so the carry-over read is re-derived', async () => {
    const { upsertCategory } = await import('@/server-actions/categories')
    const { CACHE_TAGS } = await import('@/lib/cache')

    await upsertCategory({ id: 'cat-1', ...base, includeInBalance: false })

    expect(revalidateTagMock).toHaveBeenCalledWith(CACHE_TAGS.categories, { expire: 0 })
    for (const path of ['/dashboard', '/transactions', '/insights']) {
      expect(revalidatePathMock).toHaveBeenCalledWith(path)
    }
  })
})
