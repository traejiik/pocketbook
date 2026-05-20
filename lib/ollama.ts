export type OllamaStreamChunk = { response: string; done: boolean };

export async function* streamGenerate(opts: {
  baseUrl: string;
  model: string;
  prompt: string;
  temperature?: number;
}): AsyncGenerator<OllamaStreamChunk> {
  const res = await fetch(`${opts.baseUrl}/api/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: opts.model,
      prompt: opts.prompt,
      stream: true,
      options: { temperature: opts.temperature ?? 0.4 },
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
