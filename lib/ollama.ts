import { logger } from './logger';

const log = logger('ollama');

/**
 * Ollama's own accounting for a finished generation, reported on its final
 * chunk. `outputTokens` includes reasoning tokens, so on a thinking model it is
 * the number to compare against `numCtx` together with `promptTokens`.
 */
export type OllamaGenerateStats = {
  /** `stop` when the model finished; `length` when a cap cut it off. */
  doneReason?: string;
  promptTokens?: number;
  outputTokens?: number;
  /** Time spent generating, excluding the model load. */
  evalMs?: number;
  loadMs?: number;
};

export type OllamaStreamChunk = {
  response: string;
  /** Reasoning tokens from a thinking model. Ollama streams these in their own
   *  field, separate from `response` — a caller that accumulates only `response`
   *  correctly gets prose, but gets *nothing* if the whole budget went here. */
  thinking: string;
  done: boolean;
  /** Present only on the `done` chunk. The same counters go to the log summary;
   *  this is for a caller that wants the numbers rather than the line. */
  stats?: OllamaGenerateStats;
};

/**
 * Remove `<think>` blocks from model output.
 *
 * Ollama separates reasoning into its own response field for models whose
 * template declares thinking, so this is belt-and-braces for the case where a
 * template mismatch leaves the tags inline instead. The second pattern handles
 * output truncated mid-reasoning, where there is no closing tag to match. The
 * third handles the opposite: a template that pre-fills the opening tag, so the
 * model emits only the reasoning body and `</think>` (granite4 does this) —
 * everything before an orphan closing tag is reasoning too.
 */
export function stripThinkTags(text: string): string {
  return text
    .replace(/<think>[\s\S]*?<\/think>/gi, '')
    .replace(/<think>[\s\S]*$/i, '')
    .replace(/^[\s\S]*<\/think>/i, '')
    .trim();
}

/**
 * What to send as `think`. Hybrid models such as Qwen3 only switch reasoning on
 * or off; models whose template understands an effort level (gpt-oss, granite4)
 * take one of the three strings. Ollama accepts a level for any thinking model
 * but silently treats it as `true` where the template has no use for it.
 */
export type OllamaThink = boolean | 'low' | 'medium' | 'high';

/**
 * Generation knobs. All optional so existing callers keep the old behaviour, but
 * anything that cares about output quality should pass an explicit set — see
 * `INSIGHT_MODEL_OPTIONS` in `lib/insights-generation.ts`.
 *
 * `numCtx` matters more than it looks: Ollama falls back to a 2048-token context
 * for most models unless the Modelfile says otherwise, and it truncates from the
 * *front* — so a long prompt silently loses its opening instructions rather than
 * erroring. Any caller with a prompt bigger than a couple of paragraphs should set it.
 */
export type OllamaOptions = {
  temperature?: number;
  topP?: number;
  repeatPenalty?: number;
  /** Flat logit penalty on any token seen in the recent window. Ollama's library
   *  Qwen Modelfiles ship it at 1.5, so a caller that needs figures copied
   *  verbatim must send an explicit 0 — leaving it unset does not turn it off. */
  presencePenalty?: number;
  numCtx?: number;
  numPredict?: number;
};

/** Backoff between connection attempts, in ms. Roughly ten seconds in total. */
const RETRY_DELAYS_MS = [1_000, 3_000, 6_000];

/** Per-attempt request budget. Ten minutes: small models can be slow on first run. */
const DEFAULT_TIMEOUT_MS = 600_000;

/**
 * POST JSON, retrying only when the connection itself fails.
 *
 * A container that has just started refuses connections for a few seconds, and
 * `fetch` rejects immediately rather than waiting — so a generation kicked off
 * while Ollama was booting failed instantly and had to be retried by hand. An
 * HTTP error status is *not* retried (it resolves, and the caller reports it),
 * and neither is a timeout: the request budget is spent, so trying again just
 * doubles the wait. Each attempt gets its own timeout signal.
 */
async function postWithRetry(url: string, body: unknown, timeoutMs: number): Promise<Response> {
  let lastError: unknown;

  for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
    try {
      return await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (err) {
      const name = (err as { name?: string })?.name;
      if (name === 'TimeoutError' || name === 'AbortError') {
        log.error('request timed out', { url, err });
        throw err;
      }
      lastError = err;
      const delay = RETRY_DELAYS_MS[attempt];
      // Worth a line each time: a generation that "just hangs" for ten seconds is
      // usually Ollama still starting, and this is the only evidence of it.
      log.warn('connection failed', {
        url,
        attempt: attempt + 1,
        of: RETRY_DELAYS_MS.length + 1,
        retryInMs: delay,
        err,
      });
      if (delay !== undefined) await new Promise((r) => setTimeout(r, delay));
    }
  }

  log.error('connection failed after all retries', { url, err: lastError });
  throw lastError;
}

export async function* streamGenerate(opts: {
  baseUrl: string;
  model: string;
  prompt: string;
  /** Persona and hard rules. Ollama slots this into the model's chat template as
   *  the system turn, which 8B-class models follow noticeably better than the
   *  same text pasted at the top of `prompt`. */
  system?: string;
  /**
   * Hybrid reasoning models (Qwen3 and friends) think before answering unless
   * told not to. Reasoning tokens are billed against `numPredict` and against
   * the request timeout, so leaving this on for a long prompt on modest hardware
   * can consume the entire budget before any prose is emitted. Sent only when
   * set, so models with no thinking support never see the field.
   */
  think?: OllamaThink;
  options?: OllamaOptions;
  /**
   * Wall-clock budget for the whole generation, reasoning included. Defaults to
   * ten minutes, which fits a note with reasoning off; a caller that turns
   * reasoning on must raise it, because the timeout is not retried.
   */
  timeoutMs?: number;
  /** @deprecated pass `options.temperature` instead. Kept so old call sites work. */
  temperature?: number;
}): AsyncGenerator<OllamaStreamChunk> {
  const o = opts.options ?? {};
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const startedAt = Date.now();
  const request = {
    model: opts.model,
    promptChars: opts.prompt.length,
    systemChars: opts.system?.length ?? 0,
    think: opts.think,
    temperature: o.temperature ?? opts.temperature ?? 0.4,
    numCtx: o.numCtx,
    numPredict: o.numPredict,
    timeoutMs,
  };
  log.info('generate started', { ...request, url: `${opts.baseUrl}/api/generate` });

  const res = await postWithRetry(
    `${opts.baseUrl}/api/generate`,
    {
      model: opts.model,
      prompt: opts.prompt,
      ...(opts.system ? { system: opts.system } : {}),
      ...(opts.think === undefined ? {} : { think: opts.think }),
      stream: true,
      // Ollama uses snake_case for these; the camelCase names above are the JS-side
      // spelling. Undefined keys are dropped by JSON.stringify, so an unset knob
      // leaves Ollama on its own default rather than being sent as null.
      options: {
        temperature: o.temperature ?? opts.temperature ?? 0.4,
        top_p: o.topP,
        repeat_penalty: o.repeatPenalty,
        presence_penalty: o.presencePenalty,
        num_ctx: o.numCtx,
        num_predict: o.numPredict,
      },
    },
    timeoutMs,
  );
  if (!res.ok || !res.body) {
    log.error('generate rejected', {
      ...request,
      status: res.status,
      body: res.ok ? 'empty response body' : undefined,
      ms: Date.now() - startedAt,
    });
    throw new Error(`Ollama: ${res.status}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = '';

  // Generation accounting. Ollama reports its own counters on the final chunk;
  // they are the only reliable answer to "did the prompt fit in num_ctx?" and
  // "where did the time go?", which is exactly what a slow or empty note needs.
  let responseChars = 0;
  let thinkingChars = 0;
  let chunks = 0;
  let firstTokenMs: number | undefined;
  let doneReason: string | undefined;
  let promptTokens: number | undefined;
  let outputTokens: number | undefined;
  let evalDurationNs: number | undefined;
  let loadDurationNs: number | undefined;

  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      const lines = buf.split('\n');
      buf = lines.pop() ?? '';
      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const chunk = JSON.parse(line);
          const response: string = chunk.response ?? '';
          const thinking: string = chunk.thinking ?? '';
          chunks++;
          responseChars += response.length;
          thinkingChars += thinking.length;
          if (firstTokenMs === undefined && (response || thinking)) {
            firstTokenMs = Date.now() - startedAt;
          }
          if (chunk.done) {
            doneReason = chunk.done_reason ?? undefined;
            promptTokens = chunk.prompt_eval_count ?? undefined;
            outputTokens = chunk.eval_count ?? undefined;
            evalDurationNs = chunk.eval_duration ?? undefined;
            loadDurationNs = chunk.load_duration ?? undefined;
          }
          // The key is present only on the final chunk, so a consumer comparing
          // earlier chunks structurally sees exactly the three streaming fields.
          const stats: OllamaGenerateStats | undefined = chunk.done
            ? {
                doneReason,
                promptTokens,
                outputTokens,
                evalMs: evalDurationNs === undefined ? undefined : Math.round(evalDurationNs / 1e6),
                loadMs: loadDurationNs === undefined ? undefined : Math.round(loadDurationNs / 1e6),
              }
            : undefined;
          yield {
            response,
            thinking,
            done: chunk.done ?? false,
            ...(stats ? { stats } : {}),
          };
        } catch {
          // Tolerate partial JSON lines
        }
      }
    }
  } finally {
    // `finally`, not a trailing statement: every caller breaks out of its loop on
    // the `done` chunk, which closes this generator before the loop above ends.
    const ms = Date.now() - startedAt;
    const summary = {
      ...request,
      ms,
      ttftMs: firstTokenMs,
      chars: responseChars,
      thinkingChars,
      chunks,
      doneReason,
      promptTokens,
      outputTokens,
      loadMs: loadDurationNs === undefined ? undefined : Math.round(loadDurationNs / 1e6),
      tokensPerSec:
        outputTokens && evalDurationNs
          ? Number((outputTokens / (evalDurationNs / 1e9)).toFixed(1))
          : undefined,
    };
    if (responseChars === 0) {
      // The v2.13.1 failure mode: reasoning (or a num_predict cap) consumed the
      // whole budget and the caller received a stream with no prose in it.
      log.error('generate produced no text', summary);
    } else if (doneReason && doneReason !== 'stop') {
      log.warn('generate ended early', summary);
    } else {
      log.info('generate finished', summary);
    }
  }
}

export async function pingOllama(baseUrl: string): Promise<boolean> {
  try {
    const res = await fetch(`${baseUrl}/api/tags`, { signal: AbortSignal.timeout(3000) });
    return res.ok;
  } catch {
    return false;
  }
}

export async function listOllamaModels(baseUrl: string): Promise<Array<{ name: string; size: number }>> {
  try {
    const res = await fetch(`${baseUrl}/api/tags`, { signal: AbortSignal.timeout(3000) });
    if (!res.ok) return [];
    const json = await res.json() as { models?: Array<{ name: string; size: number }> };
    return json.models ?? [];
  } catch {
    return [];
  }
}
