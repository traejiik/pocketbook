export type OllamaStreamChunk = { response: string; done: boolean };

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
  numCtx?: number;
  numPredict?: number;
};

export async function* streamGenerate(opts: {
  baseUrl: string;
  model: string;
  prompt: string;
  /** Persona and hard rules. Ollama slots this into the model's chat template as
   *  the system turn, which 8B-class models follow noticeably better than the
   *  same text pasted at the top of `prompt`. */
  system?: string;
  options?: OllamaOptions;
  /** @deprecated pass `options.temperature` instead. Kept so old call sites work. */
  temperature?: number;
}): AsyncGenerator<OllamaStreamChunk> {
  const o = opts.options ?? {};
  const res = await fetch(`${opts.baseUrl}/api/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: opts.model,
      prompt: opts.prompt,
      ...(opts.system ? { system: opts.system } : {}),
      stream: true,
      // Ollama uses snake_case for these; the camelCase names above are the JS-side
      // spelling. Undefined keys are dropped by JSON.stringify, so an unset knob
      // leaves Ollama on its own default rather than being sent as null.
      options: {
        temperature: o.temperature ?? opts.temperature ?? 0.4,
        top_p: o.topP,
        repeat_penalty: o.repeatPenalty,
        num_ctx: o.numCtx,
        num_predict: o.numPredict,
      },
    }),
    signal: AbortSignal.timeout(600_000), // 10 min — small models can be slow on first run
  });
  if (!res.ok || !res.body) throw new Error(`Ollama: ${res.status}`);

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = '';

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
        yield { response: chunk.response ?? '', done: chunk.done ?? false };
      } catch {
        // Tolerate partial JSON lines
      }
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
