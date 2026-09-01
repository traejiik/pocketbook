import { afterEach, describe, expect, it, vi } from 'vitest'
import { streamGenerate } from '@/lib/ollama'

function okResponse() {
  return {
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
  }
}

async function drain(gen: AsyncGenerator<unknown>) {
  for await (const _ of gen) { /* consume */ }
}

const run = () => streamGenerate({ baseUrl: 'http://ollama:11434', model: 'm', prompt: 'x' })

afterEach(() => vi.useRealTimers())

describe('streamGenerate connection retry', () => {
  // A container that has just started refuses connections for a few seconds and
  // `fetch` rejects instantly, so a generation begun while Ollama was booting used
  // to fail immediately and need a manual retry.
  it('retries a refused connection and succeeds', async () => {
    vi.useFakeTimers()
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(Object.assign(new TypeError('fetch failed'), { name: 'TypeError' }))
      .mockResolvedValue(okResponse())
    vi.stubGlobal('fetch', fetchMock)

    const done = drain(run())
    await vi.advanceTimersByTimeAsync(10_000)   // step through the backoff
    await done
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('gives up after exhausting its attempts and rethrows', async () => {
    vi.useFakeTimers()
    const fetchMock = vi.fn().mockRejectedValue(new TypeError('fetch failed'))
    vi.stubGlobal('fetch', fetchMock)

    const assertion = expect(drain(run())).rejects.toThrow(/fetch failed/)
    await vi.advanceTimersByTimeAsync(30_000)
    await assertion
    expect(fetchMock).toHaveBeenCalledTimes(4) // initial attempt + 3 backoffs
  })

  // The request budget is already spent, so retrying only doubles the wait.
  it('does not retry a timeout', async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValue(Object.assign(new Error('timed out'), { name: 'TimeoutError' }))
    vi.stubGlobal('fetch', fetchMock)

    await expect(drain(run())).rejects.toThrow(/timed out/)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  // An HTTP error status resolves rather than rejecting; the caller reports it.
  it('does not retry an HTTP error status', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 404, body: null })
    vi.stubGlobal('fetch', fetchMock)

    await expect(drain(run())).rejects.toThrow(/Ollama: 404/)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})
