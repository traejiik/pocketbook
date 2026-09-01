import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  create: vi.fn(),
  deleteMany: vi.fn(),
  findFirst: vi.fn(),
  stream: vi.fn(),
  snapshot: vi.fn(),
  buildPrompt: vi.fn(),
}))

vi.mock('@/lib/prisma', () => ({
  prisma: {
    user: { findFirst: mocks.findFirst },
    aiInsight: { create: mocks.create, deleteMany: mocks.deleteMany },
  },
}))
vi.mock('@/lib/insights-data', () => ({ collectInsightSnapshot: mocks.snapshot }))
vi.mock('@/lib/insights-prompt', () => ({ buildPromptFromSnapshot: mocks.buildPrompt }))
vi.mock('@/lib/ollama', async (importOriginal) => ({
  // `stripThinkTags` stays real — it is part of what is under test here.
  ...(await importOriginal<typeof import('@/lib/ollama')>()),
  streamGenerate: mocks.stream,
}))

/** Stand in for Ollama, yielding the given text as one chunk per entry. */
function yields(...responses: { response?: string; thinking?: string }[]) {
  mocks.stream.mockImplementation(async function* () {
    for (const r of responses) {
      yield { response: r.response ?? '', thinking: r.thinking ?? '', done: false }
    }
    yield { response: '', thinking: '', done: true }
  })
}

describe('generateAndSaveInsight', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.findFirst.mockResolvedValue({ id: 'user-1' })
    mocks.create.mockResolvedValue({ id: 'insight-1' })
    mocks.snapshot.mockResolvedValue({ monthKey: '2026-09' })
    mocks.buildPrompt.mockReturnValue({ system: 'sys', prompt: 'usr' })
  })

  const run = async () => {
    const { generateAndSaveInsight } = await import('@/lib/insights-generation')
    return generateAndSaveInsight({
      monthCovered: '2026-09',
      ollamaUrl: 'http://ollama:11434',
      ollamaModel: 'qwen3.5:4b',
    })
  }

  it('saves a note when the model produces prose', async () => {
    yields({ response: 'August ran short by 85 000 Ft.' })
    await expect(run()).resolves.toEqual({ id: 'insight-1' })
    expect(mocks.create).toHaveBeenCalledOnce()
    expect(mocks.create.mock.calls[0][0].data.content).toBe('August ran short by 85 000 Ft.')
  })

  // The regression. A thinking model exhausted its token budget on reasoning and
  // emitted zero response tokens; the empty string was persisted as a normal row,
  // which the UI renders as a note with a heading and no body — and which
  // suppresses the "nothing generated yet" state for that month.
  it('refuses to persist a note when the model returned no prose', async () => {
    yields({ thinking: 'a great deal of reasoning', response: '' })
    await expect(run()).rejects.toThrow(/no text/i)
    expect(mocks.create).not.toHaveBeenCalled()
    expect(mocks.deleteMany).not.toHaveBeenCalled()
  })

  it('refuses to persist a whitespace-only note', async () => {
    yields({ response: '   \n\n  ' })
    await expect(run()).rejects.toThrow(/no text/i)
    expect(mocks.create).not.toHaveBeenCalled()
  })

  // Belt-and-braces for a template that leaves reasoning inline rather than
  // splitting it into its own field: the tags must never reach the database.
  it('strips inline reasoning tags before saving', async () => {
    yields({ response: '<think>weighing it up</think>\n\nGroceries rose 40%.' })
    await run()
    expect(mocks.create.mock.calls[0][0].data.content).toBe('Groceries rose 40%.')
  })

  it('refuses to persist a note that was nothing but inline reasoning', async () => {
    yields({ response: '<think>reasoning that never finished' })
    await expect(run()).rejects.toThrow(/no text/i)
    expect(mocks.create).not.toHaveBeenCalled()
  })
})
