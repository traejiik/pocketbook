import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { configureLogger, resetLoggerConfig, setLogSink, type LogLevel } from '@/lib/logger'
import { streamGenerate } from '@/lib/ollama'

let lines: Array<{ level: LogLevel; line: string }> = []

beforeEach(() => {
  lines = []
  setLogSink((level, line) => lines.push({ level, line }))
  configureLogger({ level: 'debug', format: 'pretty', color: false, requests: true })
})

afterEach(() => {
  setLogSink(null)
  resetLoggerConfig()
  vi.unstubAllGlobals()
})

const text = () => lines.map((entry) => entry.line).join('\n')

/** A streaming Ollama response: one NDJSON line per chunk. */
function respondWith(...chunks: Record<string, unknown>[]) {
  const encoder = new TextEncoder()
  let index = 0
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    body: {
      getReader: () => ({
        read: async () =>
          index < chunks.length
            ? { value: encoder.encode(`${JSON.stringify(chunks[index++])}\n`), done: false }
            : { value: undefined, done: true },
      }),
    },
  }))
}

/** Consume like the real callers do: stop reading at the `done` chunk. */
async function drain() {
  const generator = streamGenerate({
    baseUrl: 'http://ollama:11434',
    model: 'qwen3.5:4b',
    prompt: 'usr',
    system: 'sys',
    think: false,
    options: { numCtx: 4096, temperature: 0.7 },
  })
  let out = ''
  for await (const chunk of generator) {
    out += chunk.response
    if (chunk.done) break
  }
  return out
}

describe('generation logging', () => {
  it('reports the counters Ollama returns on the final chunk', async () => {
    respondWith(
      { response: 'August ran short.', done: false },
      {
        response: '',
        done: true,
        done_reason: 'stop',
        prompt_eval_count: 1180,
        eval_count: 604,
        eval_duration: 100_000_000_000,
        load_duration: 2_000_000_000,
      },
    )

    await expect(drain()).resolves.toBe('August ran short.')

    // The prompt-size question these answer ("does the prompt fit in num_ctx?")
    // was previously only estimable from a character count.
    expect(text()).toContain('generate finished')
    expect(text()).toContain('promptTokens=1180')
    expect(text()).toContain('outputTokens=604')
    expect(text()).toContain('doneReason=stop')
    expect(text()).toContain('tokensPerSec=6')
    expect(text()).toContain('loadMs=2000')
    expect(text()).toContain('numCtx=4096')
  })

  // The same counters, handed to the caller instead of only written to the log:
  // a diagnostic comparing two runs wants the numbers, not the line.
  it('hands the counters to the caller on the final chunk only', async () => {
    respondWith(
      { response: 'August ran short.', done: false },
      {
        response: '',
        done: true,
        done_reason: 'stop',
        prompt_eval_count: 1180,
        eval_count: 604,
        eval_duration: 100_000_000_000,
        load_duration: 2_000_000_000,
      },
    )

    const chunks = []
    for await (const chunk of streamGenerate({ baseUrl: 'http://ollama:11434', model: 'm', prompt: 'x' })) {
      chunks.push(chunk)
    }

    expect(chunks[0]).not.toHaveProperty('stats')
    expect(chunks[1].stats).toEqual({
      doneReason: 'stop',
      promptTokens: 1180,
      outputTokens: 604,
      evalMs: 100_000,
      loadMs: 2000,
    })
  })

  it('records the request budget so a timed-out run shows what it was given', async () => {
    respondWith({ response: 'hi', done: true, done_reason: 'stop' })

    await drain()
    expect(text()).toContain('timeoutMs=600000')
  })

  // The v2.13.1 regression: reasoning consumed the whole budget and the caller
  // received a stream containing no prose at all.
  it('raises an error when the model streams no prose', async () => {
    respondWith({
      response: '',
      thinking: 'let me think about this',
      done: true,
      done_reason: 'length',
      eval_count: 800,
    })

    await expect(drain()).resolves.toBe('')

    const failure = lines.find((entry) => entry.line.includes('generate produced no text'))
    expect(failure?.level).toBe('error')
    expect(failure?.line).toContain('thinkingChars=23')
    expect(failure?.line).toContain('doneReason=length')
  })

  it('warns when generation stops for any reason other than completing', async () => {
    respondWith(
      { response: 'August ran short', done: false },
      { response: '', done: true, done_reason: 'length' },
    )

    await drain()

    const warning = lines.find((entry) => entry.line.includes('generate ended early'))
    expect(warning?.level).toBe('warn')
  })

  it('logs a rejected request with its status instead of a summary', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 500, body: null }))

    await expect(drain()).rejects.toThrow('Ollama: 500')
    expect(text()).toContain('generate rejected')
    expect(text()).toContain('status=500')
  })

  it('records each connection retry while Ollama is still starting', async () => {
    vi.useFakeTimers()
    const encoder = new TextEncoder()
    let read = false
    vi.stubGlobal('fetch', vi.fn()
      .mockRejectedValueOnce(Object.assign(new TypeError('fetch failed'), { name: 'TypeError' }))
      .mockResolvedValue({
        ok: true,
        status: 200,
        body: {
          getReader: () => ({
            read: async () => {
              if (read) return { value: undefined, done: true }
              read = true
              return { value: encoder.encode('{"response":"hi","done":true}\n'), done: false }
            },
          }),
        },
      }))

    const pending = drain()
    await vi.runAllTimersAsync()
    await expect(pending).resolves.toBe('hi')
    vi.useRealTimers()

    const retry = lines.find((entry) => entry.line.includes('connection failed'))
    expect(retry?.level).toBe('warn')
    expect(retry?.line).toContain('attempt=1 of=4 retryInMs=1000')
  })
})
