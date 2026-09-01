import { describe, expect, it, vi } from 'vitest'
import { INSIGHT_MODEL_OPTIONS } from '@/lib/insights-generation'
import { streamGenerate } from '@/lib/ollama'

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
        options: INSIGHT_MODEL_OPTIONS,
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
        options: INSIGHT_MODEL_OPTIONS,
      }),
    )

    const body = JSON.parse(fetchMock.mock.calls[0][1].body)
    expect(body.options).toMatchObject({
      temperature: 0.7,
      top_p: 0.9,
      repeat_penalty: 1.15,
      // Ollama defaults most models to 2048 and truncates from the front, which
      // would silently eat the output rules at the top of the prompt.
      num_ctx: 8192,
      num_predict: 800,
    })
  })

  it('leaves unset knobs off the request rather than sending null', async () => {
    const fetchMock = stubOllama()
    await drain(streamGenerate({ baseUrl: 'http://ollama:11434', model: 'm', prompt: 'x' }))

    const body = JSON.parse(fetchMock.mock.calls[0][1].body)
    expect(body.options).toEqual({ temperature: 0.4 })
    expect(body).not.toHaveProperty('system')
  })
})
