import { describe, expect, it, vi } from 'vitest'
import { INSIGHT_MODEL_OPTIONS, INSIGHT_REQUEST } from '@/lib/insights-generation'
import { streamGenerate, stripThinkTags } from '@/lib/ollama'

function stubOllama() {
  const fetchMock = vi.fn().mockResolvedValue({
    ok: true,
    body: {
      getReader: () => ({
        read: vi
          .fn()
          .mockResolvedValueOnce({
            value: new TextEncoder().encode('{"response":"hi","done":true}\n'),
            done: false,
          })
          .mockResolvedValue({ value: undefined, done: true }),
      }),
    },
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

async function drain(gen: AsyncGenerator<unknown>) {
  for await (const _ of gen) { /* consume */ }
}

describe('streamGenerate', () => {
  it('sends the system prompt as a sibling field, not glued onto the prompt', async () => {
    const fetchMock = stubOllama()
    await drain(
      streamGenerate({
        baseUrl: 'http://ollama:11434',
        model: 'llama3.1:8b',
        system: 'You are the analyst.',
        prompt: 'Monthly note.',
        ...INSIGHT_REQUEST,
      }),
    )

    const body = JSON.parse(fetchMock.mock.calls[0][1].body)
    expect(body.system).toBe('You are the analyst.')
    expect(body.prompt).toBe('Monthly note.')
  })

  it('passes the insight generation knobs through in Ollama snake_case', async () => {
    const fetchMock = stubOllama()
    await drain(
      streamGenerate({
        baseUrl: 'http://ollama:11434',
        model: 'llama3.1:8b',
        prompt: 'x',
        ...INSIGHT_REQUEST,
      }),
    )

    const body = JSON.parse(fetchMock.mock.calls[0][1].body)
    expect(body.options).toMatchObject({
      temperature: 0.7,
      top_p: 0.9,
      // Both penalties off. Qwen's digits tokenise one per character and every
      // amount ends in the same `Ft` token, so a penalty on recently used tokens
      // pushed the model into "forty thousand" and "F" instead of copying figures.
      repeat_penalty: 1,
      presence_penalty: 0,
      // Ollama defaults most models to 2048 and truncates from the front, which
      // would silently eat the output rules at the top of the prompt. 4096 is
      // ~2x the measured worst-case prompt; a bigger window costs CPU time.
      num_ctx: 4096,
    })
  })

  // Regression: an 800-token cap was consumed entirely by a thinking model's
  // reasoning, so the run finished with done_reason "length" having emitted zero
  // response tokens. A full note measured ~750 tokens even with reasoning off,
  // so no cap in that range is safe. The request timeout is the backstop.
  it('sets no output token cap for insights', async () => {
    const fetchMock = stubOllama()
    await drain(
      streamGenerate({ baseUrl: 'http://ollama:11434', model: 'm', prompt: 'x', ...INSIGHT_REQUEST }),
    )

    const body = JSON.parse(fetchMock.mock.calls[0][1].body)
    expect(body.options.num_predict).toBeUndefined()
    expect(INSIGHT_MODEL_OPTIONS).not.toHaveProperty('numPredict')
  })

  it('disables thinking for insight generation', async () => {
    const fetchMock = stubOllama()
    await drain(
      streamGenerate({ baseUrl: 'http://ollama:11434', model: 'm', prompt: 'x', ...INSIGHT_REQUEST }),
    )

    // Top-level field, sibling to `stream` — not one of the `options` knobs.
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).think).toBe(false)
  })

  it('omits `think` entirely when the caller does not set it', async () => {
    const fetchMock = stubOllama()
    await drain(streamGenerate({ baseUrl: 'http://ollama:11434', model: 'm', prompt: 'x' }))

    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).not.toHaveProperty('think')
  })

  it('surfaces reasoning tokens separately from prose', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        body: {
          getReader: () => ({
            read: vi
              .fn()
              .mockResolvedValueOnce({
                value: new TextEncoder().encode('{"thinking":"hmm","response":"","done":false}\n'),
                done: false,
              })
              .mockResolvedValue({ value: undefined, done: true }),
          }),
        },
      }),
    )

    const chunks = []
    for await (const c of streamGenerate({ baseUrl: 'http://o', model: 'm', prompt: 'x' })) {
      chunks.push(c)
    }
    expect(chunks[0]).toEqual({ response: '', thinking: 'hmm', done: false })
  })
})

describe('stripThinkTags', () => {
  it('removes a complete reasoning block', () => {
    expect(stripThinkTags('<think>weighing options</think>\n\nYou spent 200 Ft.')).toBe(
      'You spent 200 Ft.',
    )
  })

  it('removes an unterminated block from output truncated mid-reasoning', () => {
    expect(stripThinkTags('<think>still reasoning and then cut off')).toBe('')
  })

  it('leaves ordinary prose untouched', () => {
    expect(stripThinkTags('Groceries rose 40% to 198 000 Ft.')).toBe(
      'Groceries rose 40% to 198 000 Ft.',
    )
  })

  it('leaves unset knobs off the request rather than sending null', async () => {
    const fetchMock = stubOllama()
    await drain(streamGenerate({ baseUrl: 'http://ollama:11434', model: 'm', prompt: 'x' }))

    const body = JSON.parse(fetchMock.mock.calls[0][1].body)
    expect(body.options).toEqual({ temperature: 0.4 })
    expect(body).not.toHaveProperty('system')
  })
})
