import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import {
  configureLogger,
  isSecretKey,
  logger,
  redactValue,
  resetLoggerConfig,
  setLogSink,
  type LogLevel,
} from '@/lib/logger'

let lines: Array<{ level: LogLevel; line: string }> = []

beforeEach(() => {
  lines = []
  setLogSink((level, line) => lines.push({ level, line }))
  // The suite runs with the logger silenced by default (see `defaultLevel`), so
  // every test opts back in explicitly.
  configureLogger({ level: 'debug', format: 'pretty', color: false, requests: true })
})

afterEach(() => {
  setLogSink(null)
  resetLoggerConfig()
})

const text = () => lines.map((entry) => entry.line).join('\n')

describe('log formatting', () => {
  it('writes a timestamped, scoped, greppable line', () => {
    logger('insights').info('generation finished', { month: '2026-08', tokens: 612 })

    expect(lines).toHaveLength(1)
    expect(lines[0].line).toMatch(
      /^\d{4}-\d{2}-\d{2}T[\d:.]+Z INFO {2}\[insights] generation finished month=2026-08 tokens=612$/,
    )
  })

  it('quotes only the values that would break the key=value split', () => {
    logger('tx').info('saved', { description: 'Coffee at Blue Bottle', currency: 'HUF' })

    expect(text()).toContain('description="Coffee at Blue Bottle" currency=HUF')
  })

  it('drops undefined fields so optional context never prints as noise', () => {
    logger('tx').info('saved', { id: undefined, ruleId: null })

    expect(text()).toContain('ruleId=null')
    expect(text()).not.toContain('id=')
  })

  it('emits one JSON object per line when PB_LOG_FORMAT=json', () => {
    configureLogger({ format: 'json' })
    logger('jobs').warn('backup deferred', { source: 'scheduled' })

    expect(JSON.parse(lines[0].line)).toMatchObject({
      level: 'warn',
      scope: 'jobs',
      msg: 'backup deferred',
      source: 'scheduled',
    })
  })

  it('sends warnings and errors to stderr, everything else to stdout', () => {
    const log = logger('scope')
    log.debug('d')
    log.info('i')
    log.warn('w')
    log.error('e')

    expect(lines.map((entry) => entry.level)).toEqual(['debug', 'info', 'warn', 'error'])
  })
})

describe('level filtering', () => {
  it('suppresses anything below the configured level', () => {
    configureLogger({ level: 'warn' })
    const log = logger('scope')
    log.debug('d')
    log.info('i')
    log.warn('w')
    log.error('e')

    expect(lines.map((entry) => entry.level)).toEqual(['warn', 'error'])
  })

  it('writes nothing at all when silenced', () => {
    configureLogger({ level: 'silent' })
    logger('scope').error('boom')

    expect(lines).toHaveLength(0)
  })
})

describe('redaction', () => {
  it('never prints the value of a credential-shaped field', () => {
    logger('auth').info('config', {
      password: 'hunter2',
      authSecret: 'abc',
      webhookUrl: 'https://discord.com/api/webhooks/1/xyz',
      jobToken: 'deadbeef',
    })

    expect(text()).not.toContain('hunter2')
    expect(text()).not.toContain('deadbeef')
    expect(text()).not.toContain('xyz')
    expect(text()).toContain('password=[redacted]')
  })

  // Generation counters read as credentials to a naive substring match, and they
  // are the whole point of the Ollama summary line.
  it('keeps token counters readable', () => {
    expect(isSecretKey('tokens')).toBe(false)
    expect(isSecretKey('promptTokens')).toBe(false)
    expect(isSecretKey('token')).toBe(true)
    expect(isSecretKey('x-internal-job-token')).toBe(true)
  })

  it('strips a Discord webhook out of free text as well as fields', () => {
    expect(redactValue('POST https://discord.com/api/webhooks/123/s3cr3t failed')).toBe(
      'POST https://discord.com/api/webhooks/[redacted] failed',
    )
  })

  it('redacts a webhook that appears inside a logged error', () => {
    logger('notifications').warn('delivery failed', {
      err: new Error('connect ECONNREFUSED https://discord.com/api/webhooks/1/s3cr3t'),
    })

    expect(text()).not.toContain('s3cr3t')
  })
})

describe('errors', () => {
  it('unpacks an error into a summary field plus an indented stack', () => {
    logger('jobs').error('backup failed', { err: new Error('pg_dump exited 1') })

    expect(lines[0].line).toContain('err="Error: pg_dump exited 1"')
    expect(lines[0].line.split('\n')[1]).toMatch(/^ {4}Error: pg_dump exited 1$/)
  })

  it('reports a Prisma-style error code alongside the message', () => {
    const error = Object.assign(new Error('Unique constraint failed'), { code: 'P2002' })
    logger('categories').error('write failed', { err: error })

    expect(text()).toContain('errCode=P2002')
  })

  it('handles a thrown non-Error without losing the line', () => {
    logger('scope').error('failed', { err: 'just a string' })

    expect(text()).toContain('err="just a string"')
  })

  // A retried connection or a timed-out webhook is expected and recoverable; ten
  // frames of trace each would bury the line they belong to.
  it('keeps stacks off anything below error level', () => {
    logger('scope').info('noted', { err: new Error('context only') })
    logger('ollama').warn('connection failed', { err: new Error('fetch failed') })

    expect(lines[0].line).not.toContain('\n')
    expect(lines[1].line).not.toContain('\n')
    expect(lines[1].line).toContain('err="Error: fetch failed"')
  })
})

describe('timers and tracking', () => {
  it('records a duration on completion', () => {
    const timer = logger('fx').start('fx sync', { source: 'manual' })
    timer.ok({ synced: 6 })

    expect(text()).toContain('fx sync started source=manual')
    expect(text()).toMatch(/fx sync ok source=manual synced=6 ms=\d+/)
  })

  it('logs a skip with its reason instead of a success', () => {
    logger('fx').start('fx sync').skip('automatic FX sync disabled')

    expect(text()).toMatch(/fx sync skipped reason="automatic FX sync disabled" ms=\d+/)
  })

  it('track logs the result and returns it unchanged', async () => {
    const result = await logger('tx').track('transaction.create', { id: 'a1' }, async () => 'saved')

    expect(result).toBe('saved')
    expect(text()).toContain('transaction.create ok')
  })

  // The codebase reports user-facing validation failures as a returned `{ error }`
  // rather than a throw; those are the "my save did nothing" cases.
  it('track reports a returned { error } as a rejection, not a success', async () => {
    const result = await logger('recurring').track('rule.create', {}, async () => ({
      error: 'A rule with that name already exists.',
    }))

    expect(result).toEqual({ error: 'A rule with that name already exists.' })
    expect(text()).toContain('rule.create rejected')
    expect(text()).toContain('reason="A rule with that name already exists."')
    expect(text()).not.toContain('rule.create ok')
  })

  it('track logs a failure and rethrows so control flow is unchanged', async () => {
    await expect(
      logger('import').track('csv import', { filename: 'a.csv' }, async () => {
        throw new Error('bad header row')
      }),
    ).rejects.toThrow('bad header row')

    expect(text()).toContain('csv import failed')
    expect(text()).toContain('err="Error: bad header row"')
  })
})

describe('child loggers', () => {
  it('repeats its base fields on every line', () => {
    const log = logger('jobs').child({ job: 'backup', occurrence: '2026-09-01T02:00Z' })
    log.info('started')
    log.info('finished', { kept: 14 })

    expect(lines[0].line).toContain('job=backup')
    expect(lines[1].line).toContain('job=backup')
    expect(lines[1].line).toContain('kept=14')
  })

  it('can rename the scope while keeping the fields', () => {
    logger('jobs', { job: 'backup' }).child({}, 'backup').info('started')

    expect(lines[0].line).toContain('[backup] started job=backup')
  })
})

describe('value handling', () => {
  it('truncates a runaway value instead of flooding the log', () => {
    logger('scope').info('big', { blob: 'x'.repeat(2000) })

    const value = lines[0].line.split('blob=')[1]
    expect(value.length).toBeLessThan(600)
    expect(value).toContain('…')
  })

  it('serialises dates, objects and booleans predictably', () => {
    logger('scope').info('values', {
      when: new Date('2026-09-01T00:00:00.000Z'),
      shape: { a: 1 },
      flag: false,
    })

    expect(text()).toContain('when=2026-09-01T00:00:00.000Z')
    expect(text()).toContain('shape="{\\"a\\":1}"')
    expect(text()).toContain('flag=false')
  })

  it('survives a circular structure', () => {
    const circular: Record<string, unknown> = {}
    circular.self = circular
    logger('scope').info('values', { circular })

    expect(text()).toContain('circular=[unserialisable]')
  })
})
