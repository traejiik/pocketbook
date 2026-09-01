/**
 * Application logging.
 *
 * Everything the server does that is worth seeing in `docker logs pocketbook-web`
 * goes through here: mutations, scheduled jobs, model generations, delivery
 * attempts, and every unhandled error. Before this existed the container printed
 * migrations and the Next.js banner and then went silent, so a misbehaving
 * insight run or a failing webhook left no trace at all.
 *
 * Rules of the road:
 *   - never `console.*` in app code — use a scoped logger so every line carries a
 *     timestamp, level, and scope and can be filtered with `docker logs | grep`;
 *   - one event per line, machine-greppable `key=value` fields, no multi-line
 *     prose (stack traces are the one exception, and they are indented);
 *   - secrets never reach the sink — see `SECRET_KEY_PATTERN` and `redactValue`.
 *
 * Configuration (all optional, read from the environment at first use):
 *   PB_LOG_LEVEL    debug | info | warn | error | silent   (default: info in
 *                   production, debug elsewhere, silent under vitest)
 *   PB_LOG_FORMAT   pretty | json                          (default: pretty)
 *   PB_LOG_COLOR    1 | true to colourise the level column (default: off, so
 *                   the json-file log driver stores clean text)
 *   PB_LOG_REQUESTS 0 | false to silence per-request lines (default: on)
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'silent'
export type LogFormat = 'pretty' | 'json'
export type LogFields = Record<string, unknown>

const LEVEL_WEIGHT: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
  silent: 100,
}

/** Long values are truncated so one runaway field cannot flood the log. */
const MAX_VALUE_CHARS = 512
const MAX_STACK_CHARS = 4000

export type LoggerConfig = {
  level: LogLevel
  format: LogFormat
  color: boolean
  requests: boolean
}

function isLevel(value: string): value is LogLevel {
  return value in LEVEL_WEIGHT
}

function envFlag(name: string, fallback: boolean): boolean {
  const raw = process.env[name]?.trim().toLowerCase()
  if (raw === undefined || raw === '') return fallback
  return !(raw === '0' || raw === 'false' || raw === 'off' || raw === 'no')
}

function defaultLevel(): LogLevel {
  const raw = process.env.PB_LOG_LEVEL?.trim().toLowerCase()
  if (raw && isLevel(raw)) return raw
  // The test runner shares this module with the code under test; without this a
  // green suite would print hundreds of lines of unrelated log output.
  if (process.env.VITEST || process.env.NODE_ENV === 'test') return 'silent'
  return process.env.NODE_ENV === 'production' ? 'info' : 'debug'
}

function resolveConfig(): LoggerConfig {
  const format = process.env.PB_LOG_FORMAT?.trim().toLowerCase()
  return {
    level: defaultLevel(),
    format: format === 'json' ? 'json' : 'pretty',
    color: envFlag('PB_LOG_COLOR', false),
    requests: envFlag('PB_LOG_REQUESTS', true),
  }
}

let overrides: Partial<LoggerConfig> = {}
let cached: LoggerConfig | null = null

/** Resolved once per process — the environment does not change under us. */
export function loggerConfig(): LoggerConfig {
  if (!cached) cached = { ...resolveConfig(), ...overrides }
  return cached
}

/** Test seam: force a configuration regardless of the environment. */
export function configureLogger(next: Partial<LoggerConfig>): void {
  overrides = { ...overrides, ...next }
  cached = null
}

/** Test seam: drop overrides and re-read the environment on next use. */
export function resetLoggerConfig(): void {
  overrides = {}
  cached = null
}

export type LogSink = (level: LogLevel, line: string) => void

let sink: LogSink | null = null

/** Test seam: capture lines instead of writing them to the process streams. */
export function setLogSink(next: LogSink | null): void {
  sink = next
}

/**
 * Warnings and errors go to stderr, everything else to stdout — Docker captures
 * both, so `docker logs` shows the whole stream in order.
 *
 * This writes through `console` rather than `process.stdout`, which is the same
 * destination but is defined in every runtime Next.js compiles this module for.
 * Reaching for `process.stdout` here made Turbopack warn on the Edge copies of
 * `instrumentation.ts` and `proxy.ts` on every build.
 */
function write(level: LogLevel, line: string): void {
  if (sink) return sink(level, line)
  // eslint-disable-next-line no-console -- this file *is* the logging seam
  if (level === 'error' || level === 'warn') console.error(line)
  // eslint-disable-next-line no-console -- this file *is* the logging seam
  else console.log(line)
}

// ---------------------------------------------------------------------------
// Redaction
// ---------------------------------------------------------------------------

/**
 * Field names whose value is never printed. Matched loosely (substring, case
 * insensitive) so `webhookUrl`, `passwordHash` and `authSecret` are all covered
 * without maintaining an exact list. Credential names that only appear as a
 * suffix get their own test, so `jobToken` and `x-internal-job-token` are
 * redacted while the model's `tokens` / `promptTokens` counters are not.
 */
const SECRET_KEY_PATTERN =
  /(password|passwd|secret|webhook|authorization|cookie|credential|api[-_]?key)/i
const SECRET_KEY_SUFFIX = /token$/i

export function isSecretKey(key: string): boolean {
  return SECRET_KEY_PATTERN.test(key) || SECRET_KEY_SUFFIX.test(key)
}

/** Discord webhook URLs are secrets wherever they appear, including inside prose. */
const DISCORD_WEBHOOK_PATTERN = /(https:\/\/[^\s"']*discord(?:app)?\.com\/api\/webhooks\/)\S+/gi

export function redactValue(value: string): string {
  return value.replace(DISCORD_WEBHOOK_PATTERN, '$1[redacted]')
}

function truncate(value: string, limit = MAX_VALUE_CHARS): string {
  return value.length <= limit ? value : `${value.slice(0, limit - 1)}…`
}

function stringifyValue(value: unknown): string {
  if (value === null) return 'null'
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') {
    return String(value)
  }
  if (value instanceof Date) return value.toISOString()
  if (value instanceof Error) return `${value.name}: ${value.message}`
  try {
    return JSON.stringify(value) ?? String(value)
  } catch {
    return '[unserialisable]'
  }
}

/** `key=value`, quoted only when the value would otherwise break the field split. */
function renderField(key: string, value: string): string {
  const needsQuotes = value === '' || /[\s"=]/.test(value)
  return `${key}=${needsQuotes ? JSON.stringify(value) : value}`
}

// ---------------------------------------------------------------------------
// Error handling
// ---------------------------------------------------------------------------

/**
 * Pull the printable parts out of anything that was thrown. Errors arrive here
 * from `catch` blocks, so they are genuinely `unknown` — a rejected fetch, a
 * string, a Prisma error with a `code`, or nothing at all.
 */
export function describeError(error: unknown): { summary: string; stack?: string; code?: string } {
  if (error instanceof Error) {
    const code = (error as { code?: unknown }).code
    return {
      summary: `${error.name}: ${error.message}`,
      stack: error.stack ? truncate(error.stack, MAX_STACK_CHARS) : undefined,
      code: typeof code === 'string' || typeof code === 'number' ? String(code) : undefined,
    }
  }
  return { summary: stringifyValue(error) }
}

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------

const LEVEL_COLOR: Record<Exclude<LogLevel, 'silent'>, string> = {
  debug: '\u001b[90m',
  info: '\u001b[36m',
  warn: '\u001b[33m',
  error: '\u001b[31m',
}
const COLOR_RESET = '\u001b[0m'

function formatPretty(
  timestamp: string,
  level: Exclude<LogLevel, 'silent'>,
  scope: string,
  message: string,
  fields: Array<[string, string]>,
  stack: string | undefined,
  color: boolean,
): string {
  const label = level.toUpperCase().padEnd(5)
  const levelText = color ? `${LEVEL_COLOR[level]}${label}${COLOR_RESET}` : label
  const parts = [timestamp, levelText, `[${scope}]`, message]
  if (fields.length > 0) parts.push(fields.map(([k, v]) => renderField(k, v)).join(' '))
  const line = parts.join(' ')
  // Stacks are the one place a log entry is allowed to span lines. Indenting
  // them keeps a `grep` for the event line from dragging the trace along.
  return stack ? `${line}\n${stack.split('\n').map((l) => `    ${l.trim()}`).join('\n')}` : line
}

function formatJson(
  timestamp: string,
  level: Exclude<LogLevel, 'silent'>,
  scope: string,
  message: string,
  fields: Array<[string, string]>,
  stack: string | undefined,
): string {
  const payload: Record<string, string> = { time: timestamp, level, scope, msg: message }
  for (const [key, value] of fields) payload[key] = value
  if (stack) payload.stack = stack
  return JSON.stringify(payload)
}

// ---------------------------------------------------------------------------
// Logger
// ---------------------------------------------------------------------------

export type Timer = {
  /** Milliseconds since the timer was started. */
  elapsedMs(): number
  /** Completed as expected — `info`, with the elapsed time attached. */
  ok(fields?: LogFields): void
  /** Completed but produced nothing useful (skipped, disabled, already done). */
  skip(reason: string, fields?: LogFields): void
  /** Threw or otherwise failed — `error`, with the elapsed time attached. */
  fail(error: unknown, fields?: LogFields): void
}

export type Logger = {
  readonly scope: string
  debug(message: string, fields?: LogFields): void
  info(message: string, fields?: LogFields): void
  warn(message: string, fields?: LogFields): void
  error(message: string, fields?: LogFields): void
  /** A logger that repeats `fields` on every line (request ids, job ids, …). */
  child(fields: LogFields, scope?: string): Logger
  /** Start an operation: logs `<event> started` at debug, returns its timer. */
  start(event: string, fields?: LogFields): Timer
  /**
   * Run `fn` inside a timer. Logs `<event> ok` with a duration, `<event> rejected`
   * for the `{ error }` results this codebase returns from validation failures,
   * and `<event> failed` (plus a stack) for anything that throws. The error is
   * always rethrown — logging never changes control flow.
   */
  track<T>(event: string, fields: LogFields, fn: () => Promise<T>): Promise<T>
}

function emit(
  scope: string,
  level: Exclude<LogLevel, 'silent'>,
  message: string,
  base: LogFields,
  extra: LogFields | undefined,
): void {
  const config = loggerConfig()
  if (LEVEL_WEIGHT[level] < LEVEL_WEIGHT[config.level]) return

  const merged: LogFields = { ...base, ...extra }
  const fields: Array<[string, string]> = []
  let stack: string | undefined

  for (const [key, value] of Object.entries(merged)) {
    if (value === undefined) continue
    if (isSecretKey(key)) {
      fields.push([key, '[redacted]'])
      continue
    }
    // `err` carries the thrown value; it is unpacked into a summary field plus an
    // out-of-band stack rather than being stringified like everything else.
    if ((key === 'err' || key === 'error') && value !== null && typeof value === 'object') {
      const described = describeError(value)
      fields.push([key, truncate(redactValue(described.summary))])
      if (described.code) fields.push([`${key}Code`, described.code])
      // Stacks only at `error`. Warnings here are expected, recoverable states —
      // a refused connection that will be retried, a webhook that timed out — and
      // ten frames of trace each would bury the line they belong to.
      if (described.stack && level === 'error') stack = redactValue(described.stack)
      continue
    }
    fields.push([key, truncate(redactValue(stringifyValue(value)))])
  }

  const timestamp = new Date().toISOString()
  const safeMessage = truncate(redactValue(message))
  write(
    level,
    config.format === 'json'
      ? formatJson(timestamp, level, scope, safeMessage, fields, stack)
      : formatPretty(timestamp, level, scope, safeMessage, fields, stack, config.color),
  )
}

/**
 * Create a scoped logger. The scope is the `[bracketed]` column in the output and
 * is what you grep for: `docker logs pocketbook-web | grep '\[insights\]'`.
 */
export function logger(scope: string, base: LogFields = {}): Logger {
  const self: Logger = {
    scope,
    debug: (message, fields) => emit(scope, 'debug', message, base, fields),
    info: (message, fields) => emit(scope, 'info', message, base, fields),
    warn: (message, fields) => emit(scope, 'warn', message, base, fields),
    error: (message, fields) => emit(scope, 'error', message, base, fields),
    child: (fields, childScope) => logger(childScope ?? scope, { ...base, ...fields }),
    start(event, fields) {
      const startedAt = Date.now()
      emit(scope, 'debug', `${event} started`, base, fields)
      const elapsedMs = () => Date.now() - startedAt
      return {
        elapsedMs,
        ok: (done) => emit(scope, 'info', `${event} ok`, base, { ...fields, ...done, ms: elapsedMs() }),
        skip: (reason, done) =>
          emit(scope, 'info', `${event} skipped`, base, { ...fields, ...done, reason, ms: elapsedMs() }),
        fail: (error, done) =>
          emit(scope, 'error', `${event} failed`, base, { ...fields, ...done, err: error, ms: elapsedMs() }),
      }
    },
    async track(event, fields, fn) {
      const timer = self.start(event, fields)
      try {
        const result = await fn()
        // Several actions report user-facing validation failures as a returned
        // `{ error }` rather than a throw; those are not incidents, but they are
        // exactly what you want to see when a save "did nothing".
        const rejection =
          result && typeof result === 'object' && 'error' in result
            ? (result as { error: unknown }).error
            : undefined
        if (typeof rejection === 'string') {
          emit(scope, 'warn', `${event} rejected`, base, {
            ...fields,
            reason: rejection,
            ms: timer.elapsedMs(),
          })
          return result
        }
        timer.ok()
        return result
      } catch (error) {
        timer.fail(error)
        throw error
      }
    },
  }
  return self
}
