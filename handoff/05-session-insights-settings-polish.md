# Session 5 — AI Insights, Settings, Polish

Read `00-overview.md` first if you haven't — including the **Learning mode** section. This session has the densest set of new concepts: Server-Sent Events, `ReadableStream` + async generators, bcrypt cost, cron sidecars, idempotent scripts. Pause and teach each one before writing the code that uses it.

This is the final session. It lights up the AI Insights screen with real Ollama streaming, finishes Settings with the FX system + password change + LLM picker, wires the Frankfurter sync job and the CSV importer, and writes the README.

**By end of session:** the app is feature-complete for v1. You can build and run it with `docker-compose up`, point a browser at it, log in, see your data, generate a real streaming AI insight, change the anchor currency, and import a CSV.

Source mockups:
- `design-reference/mockups/source/screens/insights.jsx`
- `design-reference/mockups/source/screens/settings.jsx`

---

## Step 1 — Ollama streaming client

`lib/ollama.ts`:

```ts
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
        // Tolerate partial JSON
      }
    }
  }
}
```

---

## Step 2 — Insights server action + streaming route

`server-actions/insights.ts`:

```ts
'use server';
import { getCurrentMonthKpis, getExpensesByCategory, ... } from '@/lib/aggregations';

export async function buildInsightPrompt(): Promise<string> {
  // Pull current-month KPIs, top categories, upcoming renewals,
  // installment progress, last-month comparison.
  // Format into a structured prompt with strict instructions for tone:
  // "conversational, max 6 paragraphs, no exclamation marks, no emoji,
  //  numbers in HUF unless explicitly USD/EUR."
}

export async function saveInsight(content: string, model: string, monthCovered: string) {
  // Insert AiInsight row.
}

export async function setInsightFeedback(id: string, feedback: 'helpful' | 'not-useful') {
  // Update AiInsight.
}
```

`app/api/insights/stream/route.ts`:

```ts
import { auth } from '@/lib/auth';
import { buildInsightPrompt } from '@/server-actions/insights';
import { streamGenerate } from '@/lib/ollama';
import { prisma } from '@/lib/prisma';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const session = await auth();
  if (!session?.user) return new Response('Unauthorised', { status: 401 });

  const settings = await prisma.appSettings.findUnique({ where: { id: 'singleton' } });
  const prompt = await buildInsightPrompt();

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      let full = '';
      try {
        for await (const chunk of streamGenerate({
          baseUrl: settings!.ollamaUrl,
          model: settings!.ollamaModel,
          prompt,
        })) {
          full += chunk.response;
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ delta: chunk.response, done: chunk.done })}\n\n`));
          if (chunk.done) break;
        }
        await prisma.aiInsight.create({
          data: {
            userId: session.user.id!,
            monthCovered: new Date().toISOString().slice(0, 7),
            modelUsed: settings!.ollamaModel,
            content: full,
          },
        });
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ done: true, saved: true })}\n\n`));
      } catch (err) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: String(err) })}\n\n`));
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
}
```

---

## Step 3 — Insights screen

`app/(app)/insights/page.tsx` is a server component that fetches the most recent `AiInsight` rows for the history list. The actual streaming view is a client component.

`components/insights/InsightCard.tsx`:

Port from `insights.jsx`. State machine: `ready | loading | streaming | done`. On mount (or when `?generate=1` is in the URL), the client opens an `EventSource` to `/api/insights/stream`. State transitions:

- `ready` — show idle UI with a Generate button.
- `loading` — `bg-amber-400 animate-pulse` status dot with text "Connecting to Ollama at {baseUrl}…". Skeleton paragraphs in the note card.
- `streaming` — `bg-primary animate-pulse` dot with "Streaming response from {model}". Tokens append to the visible text. Blinking caret at the tail of the last paragraph.
- `done` — `bg-income` dot with "Generated · {tokens} tokens · {seconds}s". The Helpful / Not useful buttons appear in the footer along with the saved-to-disk message.

Per the design's interaction notes, **never fake a typewriter on a canned string**. The text rendered must be what Ollama actually returned.

`InsightStatusBar` is the dot + status text + model name on the right.

History list at the bottom: a `Card` of clickable rows showing month, date, and a one-line excerpt. Clicking a row replaces the active note card with the historical content (no re-generation).

---

## Step 4 — Settings screen

`app/(app)/settings/page.tsx`. Port from `settings.jsx`. Four sections:

### Currencies & exchange rates

- **Anchor currency** card — 4 large buttons (HUF / USD / EUR / GBP). Selected = ring + primary tint. Changing anchor calls `setAnchorCurrency(code)` server action, which:
  1. Confirms via a `Dialog` ("Switching anchor retroactively converts every non-anchor transaction. Continue?").
  2. On confirm, updates `AppSettings.anchorCurrency` and triggers a revalidation of every page.

- **Tracked currencies** card — list of `{ code, name, symbol, rate, mode, provider, updatedAt }`. Each row has:
  - Code chip (mono code + symbol stacked).
  - Name + rate display (`1 USD = 358.40 HUF`).
  - Mode toggle (Dynamic / Manual segmented control). Dynamic shows a live pulsing dot + provider name; Manual shows a number input bound to the rate.
  - Right action button to remove a tracked currency.
  - "Add currency" button at the top right opens a Dialog to add any 3-letter code.

- "Auto-sync dynamic rates daily at 03:00" Switch — bound to `AppSettings.fxAutoSync`. Provider line: `frankfurter.app · ECB feed`.

- Amber warning callout: "Switching anchor or changing manual rates retroactively converts every non-anchor transaction — past totals will shift accordingly."

Server actions in `server-actions/settings.ts`:

```ts
export async function setAnchorCurrency(code: string)
export async function setExchangeRate(input: { from: string; to: string; rate: number; mode: 'AUTO' | 'MANUAL' })
export async function addTrackedCurrency(code: string)
export async function removeTrackedCurrency(code: string)
export async function setFxAutoSync(enabled: boolean)
```

### Security

Card with: current password input, new password + confirm inputs, a 4-bar strength meter (rough heuristic: length + character classes — keep it simple), Cancel + Update. Action: `changePassword({ current, next })` — verifies via bcrypt, hashes the new one.

### AI insights

- Ollama endpoint mono display + a `Connected` Badge derived from a server-side ping (try `GET ${ollamaUrl}/api/tags`; if 200, connected; if not, show "Unreachable").
- Default model — 3 radio cards, server-fetched via Ollama's `/api/tags`. If `/api/tags` 404s or fails, hardcode the three from the mockup (`llama3.1:8b` / `mistral:7b` / `qwen2.5:14b`) and let the user pick.
- "Auto-generate on the 1st of each month" Switch — bound to `AppSettings.autoInsightsMonthly`.

### About

Three small chips: Version, Database size (`SELECT pg_size_pretty(pg_database_size('pocketbook'))`), Last backup (read mtime of `/data/last-backup` if it exists, otherwise `—`).

---

## Step 5 — Frankfurter integration + sync

`lib/frankfurter.ts`:

```ts
export async function fetchFrankfurterRate(from: string, to: string): Promise<number> {
  const res = await fetch(`https://api.frankfurter.app/latest?from=${from}&to=${to}`);
  if (!res.ok) throw new Error(`Frankfurter: ${res.status}`);
  const json = await res.json();
  return json.rates[to];
}

export async function syncAllAutoRates() {
  const rates = await prisma.exchangeRate.findMany({ where: { mode: 'AUTO' } });
  for (const r of rates) {
    try {
      const rate = await fetchFrankfurterRate(r.fromCurrency, r.toCurrency);
      await prisma.exchangeRate.update({ where: { id: r.id }, data: { rate, updatedAt: new Date() } });
    } catch (e) {
      console.error(`FX sync failed for ${r.fromCurrency}→${r.toCurrency}`, e);
    }
  }
}
```

`app/api/fx/sync/route.ts` — POST endpoint that runs `syncAllAutoRates()`. Protect with a `X-Sync-Secret` header matching env `FX_SYNC_SECRET`. Returns `{ synced: N }`.

For the scheduler, add a simple `cron` sidecar in `docker-compose.yml`:

```yaml
  cron:
    image: alpine:3.20
    container_name: pocketbook-cron
    restart: unless-stopped
    depends_on: [web]
    command: >
      sh -c "echo '0 3 * * * wget -O- --header=\"X-Sync-Secret: ${FX_SYNC_SECRET}\" --post-data= http://web:3000/api/fx/sync' > /etc/crontabs/root && crond -f"
    networks: [default]
```

Or use a single-file `node-cron` setup inside the Next.js server if Tida prefers fewer containers — but the sidecar pattern is cleaner and matches the homelab convention.

---

## Step 6 — CSV importer

`scripts/csv-import.ts`:

```ts
// Run once on first boot if /seed/transactions.csv exists.
// Columns: date,description,amount,currency,type,category_id,recurring_rule_name?
// Lookups: category by id (must already exist from prisma seed),
// recurring rule by name (if provided, otherwise null).
// Idempotent: skip rows where a Transaction with (date, description, amount) already exists.
```

Wire into the seed script so it runs after `prisma db seed` if the file exists.

Add an `Import data` button on the Dashboard (already in the mockup) that opens a file-picker drawer for ad-hoc CSV uploads. Defer the UI for the upload flow to a v1.1 unless time permits — for v1 the file-on-disk path is enough.

---

## Step 7 — README + final polish

Write `README.md`:

- One-paragraph description
- Stack + features
- Quick start: clone, copy `.env.example` → `.env`, set vars, `docker-compose up`, log in
- The Ollama integration prerequisite (needs an existing Ollama container reachable at `OLLAMA_BASE_URL`)
- CSV import format
- Architecture notes pointer to `design-reference/` and `CLAUDE.md`
- Screenshots (placeholder — Tida will add after running)

Update `CLAUDE.md` to reflect the now-implemented state (remove "Don't build" items that are now built per the drift reconciliation, add a "How to run" section).

Final cleanup:

- Remove the `__test` or `__components` preview route from session 2 (if kept)
- Verify all eight `Implementation rules` from `00-overview.md` are honoured — grep for hardcoded hex, raw spinners, "Loading…" strings, hyphen-minus signs on negative amounts
- Run `pnpm tsc --noEmit` and resolve any type errors
- Run `pnpm lint --fix`

---

## Session checklist

- [ ] `/insights` renders the status bar with live state transitions (loading → streaming → done)
- [ ] The streamed text is real Ollama output — verified by changing the model in Settings and seeing the response change
- [ ] AiInsight rows are saved to the DB; history list shows them; clicking a row swaps the view
- [ ] Helpful / Not useful buttons persist feedback
- [ ] Settings → Anchor currency change prompts confirmation and updates the app
- [ ] Settings → Manual FX rate edit updates the displayed totals across all screens
- [ ] Settings → Dynamic FX rate shows the live dot and updates via `/api/fx/sync`
- [ ] Password change works with bcrypt verification
- [ ] LLM picker reads from Ollama `/api/tags` when available, falls back to hardcoded list otherwise
- [ ] `docker-compose up` brings up `web`, `db`, and `cron` cleanly
- [ ] Cron container hits `/api/fx/sync` at 03:00 (verify by triggering manually)
- [ ] CSV importer runs on first boot if `/seed/transactions.csv` exists; idempotent on re-runs
- [ ] README explains setup end-to-end
- [ ] `pnpm tsc --noEmit` is clean
- [ ] No hardcoded hex outside SVG illustrations (grep verified)
- [ ] No "Loading…" text anywhere (grep verified)
- [ ] Commit: `feat: ai insights, settings, fx sync, csv import, docs`
- [ ] Tag: `v0.1.0`

Run `graphify update .` after completing this session if the graph is configured.

---

**You're done.** Pocketbook v1 is feature-complete. Hand back to the user for deployment to the homelab.
