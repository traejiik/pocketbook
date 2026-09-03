// Insight thinking probe: generate one month's note against a live Ollama with
// reasoning off and on, persist nothing, and write a side-by-side report.
//
// Why this exists. `INSIGHT_REQUEST.think` is false because a reasoning run on
// qwen3.5:4b once spent the whole token budget thinking and produced a blank
// note (v2.13.1). Whether reasoning *improves* a note, and whether it fits the
// hardware, was never measured — the earlier replay was ad hoc and its command
// was lost. This script is that measurement, committed so it can be re-run.
//
// It uses the exact production request: `buildInsightPrompt()` for the prompt,
// `INSIGHT_REQUEST` for the options (only `think` varies between arms), and
// `finaliseNote()` for the defect counts. It never calls
// `generateAndSaveInsight` and never writes an `AiInsight` row.
//
// Why it is bundled instead of run with tsx. Every aggregation behind the prompt
// goes through `unstable_cache`, which throws outside a Next.js process.
// `pnpm insights:probe:build` bundles this file with esbuild and aliases
// `next/cache` to `scripts/stubs/next-cache.ts`, producing one self-contained
// `.cjs` that also runs inside the production image (Node 24, no tsx).
//
//   pnpm insights:probe [--month 2026-08] [--arms off,on,low,medium,high] [--runs 1]
//                       [--timeout 1800] [--num-ctx 4096] [--out DIR]
//                       [--ollama URL] [--model NAME] [--skip-warmup]
//   pnpm insights:probe --dump prompt.json           build the prompt only
//   pnpm insights:probe --prompt prompt.json ...     replay it; no database
//
// Production recipe — Ollama is reachable only from the server, and the point is
// the real ledger, so the whole thing runs inside `pocketbook-web`:
//
//   pnpm insights:probe:build
//   scp .data/insight-probe/probe.cjs SERVER:/tmp/
//   docker exec pocketbook-web mkdir -p /app/.probe
//   docker cp /tmp/probe.cjs pocketbook-web:/app/.probe/probe.cjs
//   docker exec -d pocketbook-web sh -c 'node /app/.probe/probe.cjs --month 2026-08 \
//     --out /app/.probe/out > /app/.probe/probe.log 2>&1'
//   docker exec pocketbook-web tail -f /app/.probe/probe.log
//   docker cp pocketbook-web:/app/.probe/out ./insight-probe-2026-08
//   docker exec pocketbook-web rm -rf /app/.probe
//
// Arms map to the request's `think`: `off` → false, `on` → true, and `low` /
// `medium` / `high` → that level, for models whose template understands one.
//
// The bundle must sit under /app so `@prisma/client` resolves from the standalone
// node_modules. Run it detached: the thinking arm can take 20–30 minutes and an
// SSH drop must not kill it. Compose delivers PB_POSTGRES_USER / PASSWORD / DB
// into the container, and the script rebuilds PB_DATABASE_URL from them the way
// entrypoint.sh does; if the password is missing from the exec environment, wrap
// the command in `sh -c 'set -a; . /data/.env-cache; set +a; node ...'`. The
// Ollama URL and model come from the AppSettings row unless overridden.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { parseArgs } from 'node:util';

import type { NoteDefects } from '../lib/insights-generation';
import type { OllamaGenerateStats, OllamaStreamChunk, OllamaThink } from '../lib/ollama';

// Load .env.local then .env so PB_DATABASE_URL is available when run on a dev
// machine. Earlier files win; a real environment variable wins over both.
for (const file of ['.env.local', '.env']) {
  try {
    const contents = readFileSync(resolve(process.cwd(), file), 'utf-8');
    for (const line of contents.split('\n')) {
      const eq = line.indexOf('=');
      if (eq > 0 && !line.startsWith('#')) {
        const k = line.slice(0, eq).trim();
        const v = line.slice(eq + 1).trim();
        if (k && !(k in process.env)) process.env[k] = v;
      }
    }
  } catch {
    // File absent — rely on the environment already set.
  }
}

// Inside the container PB_DATABASE_URL exists only in the entrypoint's shell;
// `docker exec` sees the compose variables it was built from instead.
if (!process.env.PB_DATABASE_URL) {
  const user = process.env.PB_POSTGRES_USER;
  const password = process.env.PB_POSTGRES_PASSWORD;
  const db = process.env.PB_POSTGRES_DB;
  if (user && password && db) {
    const host = process.env.PB_POSTGRES_HOST ?? 'pocketbook-db';
    process.env.PB_DATABASE_URL = `postgresql://${user}:${encodeURIComponent(password)}@${host}:5432/${db}`;
  }
}

const USAGE = `insight-thinking-probe — compare an insight note with reasoning off and on

  --month YYYY-MM   month to summarise (default: newest month with transactions)
  --arms LIST       arms to run, in order, from off,on,low,medium,high (default: off,on)
  --runs N          samples per arm (default: 1)
  --timeout S       per-run budget in seconds (default: 1800, the cron budget)
  --num-ctx N       context window (default: INSIGHT_MODEL_OPTIONS.numCtx)
  --out DIR         report directory (default: .data/insight-probe/<month>-<stamp>)
  --ollama URL      override the stored Ollama URL
  --model NAME      override the stored model
  --skip-warmup     do not load the model with a one-token request first
  --dump FILE       write the prompt as JSON and exit
  --prompt FILE     replay a dumped prompt instead of reading the database
`;

const { values: args } = parseArgs({
  options: {
    month: { type: 'string' },
    ollama: { type: 'string' },
    model: { type: 'string' },
    arms: { type: 'string', default: 'off,on' },
    runs: { type: 'string', default: '1' },
    timeout: { type: 'string', default: '1800' },
    'num-ctx': { type: 'string' },
    out: { type: 'string' },
    dump: { type: 'string' },
    prompt: { type: 'string' },
    'skip-warmup': { type: 'boolean', default: false },
    help: { type: 'boolean', default: false },
  },
});

type Arm = 'off' | 'on' | 'low' | 'medium' | 'high';

const ARMS: readonly Arm[] = ['off', 'on', 'low', 'medium', 'high'];

const thinkOf = (arm: Arm): OllamaThink => (arm === 'off' ? false : arm === 'on' ? true : arm);

type PromptFile = {
  month: string;
  anchor: string;
  system: string;
  prompt: string;
  model?: string;
  ollamaUrl?: string;
  builtAt: string;
};

type NoteScore = {
  content: string;
  repaired: number;
  defects: NoteDefects;
  defectCount: number;
};

type RunResult = {
  arm: Arm;
  run: number;
  status: 'ok' | 'timed out' | 'error';
  detail?: string;
  wallMs: number;
  firstThinkingMs?: number;
  firstResponseMs?: number;
  thinkingChars: number;
  responseChars: number;
  /** `<think>`/`</think>` tags left inline in the prose: reasoning Ollama did not split out. */
  inlineThinkTags: number;
  stats?: OllamaGenerateStats;
  note: NoteScore;
  thinking: string;
  response: string;
};

type Generate = (opts: {
  baseUrl: string;
  model: string;
  prompt: string;
  system?: string;
  think?: OllamaThink;
  options?: Record<string, number | undefined>;
  timeoutMs?: number;
}) => AsyncGenerator<OllamaStreamChunk>;

type Context = {
  baseUrl: string;
  model: string;
  promptFile: PromptFile;
  options: Record<string, number | undefined>;
  numCtx: number;
  timeoutMs: number;
  generate: Generate;
  finalise: (raw: string, anchor: string) => NoteScore;
};

type ReportHeader = {
  ollamaVersion: string;
  arms: Arm[];
  runs: number;
  warmup: string;
};

function positiveInt(raw: string | undefined, name: string, fallback: number): number {
  if (raw === undefined) return fallback;
  const n = Number(raw);
  if (!Number.isInteger(n) || n <= 0) {
    throw new Error(`--${name} must be a positive integer, got "${raw}"`);
  }
  return n;
}

function parseArms(raw: string | undefined): Arm[] {
  const arms = (raw ?? 'off,on')
    .split(',')
    .map((arm) => arm.trim())
    .filter(Boolean);
  if (arms.length === 0) throw new Error(`--arms needs at least one of ${ARMS.join(', ')}`);
  for (const arm of arms) {
    if (!(ARMS as readonly string[]).includes(arm)) {
      throw new Error(`--arms accepts ${ARMS.join(', ')}; got "${arm}"`);
    }
  }
  return arms as Arm[];
}

const secs = (ms: number | undefined): string => (ms === undefined ? '–' : (ms / 1000).toFixed(1));
const num = (n: number | undefined): string => (n === undefined ? '–' : String(n));
const stamp = (): string => new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);

async function fetchVersion(baseUrl: string): Promise<string> {
  try {
    const res = await fetch(`${baseUrl}/api/version`, { signal: AbortSignal.timeout(3000) });
    if (!res.ok) return `HTTP ${res.status}`;
    const json = (await res.json()) as { version?: string };
    return json.version ? `v${json.version}` : 'unknown version';
  } catch {
    return 'version unavailable';
  }
}

async function buildPromptFile(monthArg: string | undefined): Promise<PromptFile> {
  const { prisma } = await import('../lib/prisma');
  const { getLatestTransactionMonth } = await import('../lib/aggregations');
  const { buildInsightPrompt } = await import('../lib/insights-generation');
  const { monthKeyOf } = await import('../lib/format');

  const settings = await prisma.appSettings.findUnique({ where: { id: 'singleton' } });
  const month = monthArg ?? (await getLatestTransactionMonth()) ?? monthKeyOf(new Date());
  const { system, prompt, anchor } = await buildInsightPrompt(month);
  return {
    month,
    anchor,
    system,
    prompt,
    model: settings?.ollamaModel,
    ollamaUrl: settings?.ollamaUrl,
    builtAt: new Date().toISOString(),
  };
}

async function warmUp(ctx: Context): Promise<string> {
  // Same numCtx as the real runs: a different context size makes Ollama reload
  // the model, which would hand the cold load to the first arm after all.
  console.log('warm-up: loading the model with a one-token request…');
  const started = performance.now();
  let loadMs: number | undefined;
  for await (const chunk of ctx.generate({
    baseUrl: ctx.baseUrl,
    model: ctx.model,
    prompt: 'OK',
    think: false,
    options: { ...ctx.options, numPredict: 1 },
    timeoutMs: ctx.timeoutMs,
  })) {
    if (chunk.done) {
      loadMs = chunk.stats?.loadMs;
      break;
    }
  }
  const summary = `done in ${secs(performance.now() - started)} s (model load ${secs(loadMs)} s)`;
  console.log(`warm-up: ${summary}`);
  return summary;
}

async function runOne(ctx: Context, arm: Arm, run: number): Promise<RunResult> {
  const { system, prompt, anchor } = ctx.promptFile;
  let response = '';
  let thinking = '';
  let firstThinkingMs: number | undefined;
  let firstResponseMs: number | undefined;
  let stats: OllamaGenerateStats | undefined;
  let status: RunResult['status'] = 'ok';
  let detail: string | undefined;

  const started = performance.now();
  const elapsed = () => performance.now() - started;
  // A thinking run is otherwise silent for many minutes; say something every 30 s.
  const heartbeat = setInterval(() => {
    console.error(
      `  [${arm} #${run}] ${secs(elapsed())} s · thinking ${thinking.length} chars · prose ${response.length} chars`,
    );
  }, 30_000);

  console.log(`run: think=${thinkOf(arm)} #${run} started`);
  try {
    for await (const chunk of ctx.generate({
      baseUrl: ctx.baseUrl,
      model: ctx.model,
      system,
      prompt,
      think: thinkOf(arm),
      options: ctx.options,
      timeoutMs: ctx.timeoutMs,
    })) {
      if (chunk.thinking && firstThinkingMs === undefined) firstThinkingMs = elapsed();
      if (chunk.response && firstResponseMs === undefined) firstResponseMs = elapsed();
      thinking += chunk.thinking;
      response += chunk.response;
      if (chunk.done) {
        stats = chunk.stats;
        break;
      }
    }
  } catch (err) {
    const name = (err as { name?: string })?.name;
    if (name === 'TimeoutError' || name === 'AbortError') {
      status = 'timed out';
      detail = `after ${secs(ctx.timeoutMs)} s`;
    } else {
      status = 'error';
      detail = err instanceof Error ? err.message : String(err);
    }
  } finally {
    clearInterval(heartbeat);
  }

  return {
    arm,
    run,
    status,
    detail,
    wallMs: Math.round(elapsed()),
    firstThinkingMs: firstThinkingMs === undefined ? undefined : Math.round(firstThinkingMs),
    firstResponseMs: firstResponseMs === undefined ? undefined : Math.round(firstResponseMs),
    thinkingChars: thinking.length,
    responseChars: response.length,
    inlineThinkTags: (response.match(/<\/?think>/gi) ?? []).length,
    stats,
    note: ctx.finalise(response, anchor),
    thinking,
    response,
  };
}

function outcome(result: RunResult): string {
  if (result.status === 'ok') return 'ok';
  return `${result.status} ${result.detail ?? ''}`.trim();
}

function summaryLine(result: RunResult): string {
  const s = result.stats;
  return [
    `run: think=${thinkOf(result.arm)} #${result.run} ${outcome(result)}`,
    `${secs(result.wallMs)} s`,
    `thinking ${result.thinkingChars} chars`,
    `note ${result.note.content.length} chars`,
    `tokens ${num(s?.promptTokens)}+${num(s?.outputTokens)}`,
    `repaired ${result.note.repaired}`,
    `defects ${result.note.defectCount}`,
  ].join(' · ');
}

function writeRunFiles(outDir: string, result: RunResult): void {
  const base = join(outDir, `${result.arm}-${result.run}`);
  const { thinking, response, note, ...metrics } = result;
  writeFileSync(`${base}.response.md`, `${note.content}\n`);
  writeFileSync(`${base}.thinking.md`, `${thinking}\n`);
  writeFileSync(
    `${base}.json`,
    JSON.stringify({ ...metrics, note: { ...note, content: undefined }, rawResponseChars: response.length }, null, 2),
  );
}

function writeReport(outDir: string, ctx: Context, header: ReportHeader, results: RunResult[]): void {
  const { promptFile } = ctx;
  const lines: string[] = [];
  lines.push(`# Insight thinking probe — ${promptFile.month}`, '');
  lines.push(
    `- Model: \`${ctx.model}\` at ${ctx.baseUrl} (${header.ollamaVersion}) · Node ${process.version}`,
    `- Prompt: ${promptFile.prompt.length} chars user + ${promptFile.system.length} chars system · anchor ${promptFile.anchor} · built ${promptFile.builtAt}`,
    `- Options: \`${JSON.stringify(ctx.options)}\` · timeout ${secs(ctx.timeoutMs)} s · arms ${header.arms.join(', ')} × ${header.runs}`,
    `- Warm-up: ${header.warmup}`,
    '',
    'The prompt was built once and sent unchanged to every run; only `think` varies. It reads',
    "renewals and prior-note openings as of today, so it is identical across arms but not",
    'byte-identical to the note the cron produced on the 1st.',
    '',
    '`prompt + output` counts reasoning tokens in the output. When it nears `numCtx`, Ollama',
    'drops the front of the window — the system rules — and a worse note is a context',
    'overflow, not a verdict on reasoning. Rerun that arm with `--num-ctx 8192` to separate the two.',
    '',
    '| arm | run | outcome | wall s | first thinking s | first prose s | thinking chars | note chars | prompt tokens | output tokens | prompt + output / numCtx | tok/s | load s | done reason | repaired | defects spelled / foreign / renamed |',
    '|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|',
  );
  for (const r of results) {
    const s = r.stats ?? {};
    const total =
      s.promptTokens !== undefined && s.outputTokens !== undefined
        ? `${s.promptTokens + s.outputTokens} / ${ctx.numCtx}`
        : '–';
    const tokPerSec = s.outputTokens && s.evalMs ? (s.outputTokens / (s.evalMs / 1000)).toFixed(1) : '–';
    const d = r.note.defects;
    lines.push(
      `| ${r.arm} | ${r.run} | ${outcome(r)} | ${secs(r.wallMs)} | ${secs(r.firstThinkingMs)} | ${secs(r.firstResponseMs)} | ${r.thinkingChars} | ${r.note.content.length} | ${num(s.promptTokens)} | ${num(s.outputTokens)} | ${total} | ${tokPerSec} | ${secs(s.loadMs)} | ${s.doneReason ?? '–'} | ${r.note.repaired} | ${d.spelledNumbers} / ${d.foreignCurrency} / ${d.renamedCurrency} |`,
    );
  }
  lines.push('');

  for (const r of results) {
    lines.push(`## think=${thinkOf(r.arm)} · run ${r.run} — ${outcome(r)} in ${secs(r.wallMs)} s`, '');
    if (r.inlineThinkTags > 0) {
      lines.push(`> ${r.inlineThinkTags} \`<think>\` tag(s) arrived inline in the prose; this Ollama did not split reasoning into its own field. The note below has them stripped.`, '');
    }
    lines.push(r.note.content.length > 0 ? r.note.content : '_(no prose)_', '');
    if (r.thinking.length > 0) {
      lines.push('<details>', `<summary>Reasoning (${r.thinking.length} chars)</summary>`, '', '```text', r.thinking, '```', '', '</details>', '');
    }
  }

  writeFileSync(join(outDir, 'report.md'), `${lines.join('\n')}\n`);
}

async function main(): Promise<void> {
  if (args.help) {
    console.log(USAGE);
    return;
  }
  const arms = parseArms(args.arms);
  const runs = positiveInt(args.runs, 'runs', 1);
  const timeoutMs = positiveInt(args.timeout, 'timeout', 1800) * 1000;
  if (args.month && !/^\d{4}-(0[1-9]|1[0-2])$/.test(args.month)) {
    throw new Error(`--month must be YYYY-MM, got "${args.month}"`);
  }

  let prisma: { $disconnect(): Promise<void> } | undefined;
  try {
    let promptFile: PromptFile;
    if (args.prompt) {
      // Replay touches no database. Under NODE_ENV=production `lib/prisma`
      // connects on import unless this build-phase guard is set, and inside the
      // container there may be no PB_DATABASE_URL to connect with.
      process.env.NEXT_PHASE = 'phase-production-build';
      promptFile = JSON.parse(readFileSync(resolve(args.prompt), 'utf-8')) as PromptFile;
      console.log(`prompt: replaying ${args.prompt} (${promptFile.month}, built ${promptFile.builtAt})`);
    } else {
      prisma = (await import('../lib/prisma')).prisma;
      promptFile = await buildPromptFile(args.month);
      console.log(`prompt: built for ${promptFile.month} from the database (${promptFile.prompt.length} + ${promptFile.system.length} chars)`);
    }

    if (args.dump) {
      const target = resolve(args.dump);
      mkdirSync(dirname(target), { recursive: true });
      writeFileSync(target, JSON.stringify(promptFile, null, 2));
      console.log(`wrote ${target}`);
      return;
    }

    const baseUrl =
      args.ollama ?? promptFile.ollamaUrl ?? process.env.OLLAMA_BASE_URL ?? process.env.PB_OLLAMA_BASE_URL;
    const model = args.model ?? promptFile.model;
    if (!baseUrl) throw new Error('No Ollama URL: pass --ollama, or run against a database with an AppSettings row');
    if (!model) throw new Error('No model: pass --model, or run against a database with an AppSettings row');

    const { INSIGHT_MODEL_OPTIONS, finaliseNote } = await import('../lib/insights-generation');
    const { streamGenerate } = await import('../lib/ollama');
    const numCtx = positiveInt(args['num-ctx'], 'num-ctx', INSIGHT_MODEL_OPTIONS.numCtx ?? 4096);
    const ctx: Context = {
      baseUrl,
      model,
      promptFile,
      options: { ...INSIGHT_MODEL_OPTIONS, numCtx },
      numCtx,
      timeoutMs,
      generate: streamGenerate,
      finalise: finaliseNote,
    };

    const outDir = resolve(args.out ?? join('.data', 'insight-probe', `${promptFile.month}-${stamp()}`));
    mkdirSync(outDir, { recursive: true });
    writeFileSync(join(outDir, 'prompt.json'), JSON.stringify(promptFile, null, 2));

    const ollamaVersion = await fetchVersion(baseUrl);
    console.log(`ollama: ${baseUrl} (${ollamaVersion}) · model ${model} · numCtx ${numCtx} · timeout ${secs(timeoutMs)} s`);
    console.log(`plan: arms ${arms.join(', ')} × ${runs} run(s) · report → ${outDir}`);

    const header: ReportHeader = {
      ollamaVersion,
      arms,
      runs,
      warmup: args['skip-warmup'] ? 'skipped' : await warmUp(ctx),
    };

    const results: RunResult[] = [];
    for (const arm of arms) {
      for (let run = 1; run <= runs; run++) {
        const result = await runOne(ctx, arm, run);
        results.push(result);
        // Written after every run, so a failure later leaves what already finished.
        writeRunFiles(outDir, result);
        writeReport(outDir, ctx, header, results);
        console.log(summaryLine(result));
      }
    }

    if (results.some((r) => r.status === 'error')) process.exitCode = 1;
    console.log(`report: ${join(outDir, 'report.md')}`);
  } finally {
    // The pg pool would otherwise keep the process alive after the last run.
    await prisma?.$disconnect();
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.stack ?? err.message : String(err));
  process.exit(1);
});
