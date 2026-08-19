# Localhost Notification Settings Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Discord notification settings persist on direct localhost runs, display the saved webhook in an editable URL field, and report the real validation or storage failure.

**Architecture:** Keep file-backed operational configuration and the production `/data` mount unchanged. Resolve a git-ignored repository-local path outside production, expose the stored webhook only through the already-authenticated Settings data path, and convert expected Server Action failures into typed results that the client can display.

**Tech Stack:** Next.js 16 Server Actions and Server Components, React 19, TypeScript 6, Zod, Vitest, Node filesystem APIs.

---

## File map

- `.gitignore` — prevents local notification configuration under `/.data/` from entering Git.
- `lib/notifications/config.ts` — resolves production, development, and explicit configuration paths; retains atomic `0600` writes.
- `lib/notifications/types.ts` — defines the authenticated Settings view returned to the browser.
- `server-actions/notifications.ts` — validates settings and returns safe field/storage errors.
- `app/(app)/settings/NotificationSettings.tsx` — displays and edits the full saved webhook as a URL.
- `tests/notification-config.test.ts` — covers path selection and authenticated webhook serialization.
- `tests/notification-actions.test.ts` — covers useful validation/storage results and visible webhook values.
- `tests/notification-settings-ui.test.ts` — static regression contract for the URL field and populated state.
- `README.md`, `DEPLOY.md`, ignored handoff/wiki/design context — update current behavior claims.

### Task 1: Make notification storage environment-aware

**Files:**
- Modify: `.gitignore:59-64`
- Modify: `lib/notifications/config.ts:1-17`
- Test: `tests/notification-config.test.ts`

- [ ] **Step 1: Write failing path-resolution tests**

Add `notificationConfigPath` to the existing import and add:

```ts
describe('notification config path', () => {
  it('uses a repository-local data file outside production', () => {
    expect(notificationConfigPath(
      { NODE_ENV: 'development' },
      '/repo/pocketbook',
    )).toBe('/repo/pocketbook/.data/notifications.json')
  })

  it('keeps the persistent data mount in production', () => {
    expect(notificationConfigPath(
      { NODE_ENV: 'production' },
      '/repo/pocketbook',
    )).toBe('/data/notifications.json')
  })

  it('prefers an explicit path in every environment', () => {
    expect(notificationConfigPath({
      NODE_ENV: 'production',
      PB_NOTIFICATION_CONFIG_PATH: '/tmp/pocketbook-notifications.json',
    }, '/repo/pocketbook')).toBe('/tmp/pocketbook-notifications.json')
  })
})
```

- [ ] **Step 2: Run the tests and verify the expected failure**

Run:

```bash
pnpm exec vitest run tests/notification-config.test.ts
```

Expected: FAIL because `notificationConfigPath` ignores `NODE_ENV`, `cwd`, and the new arguments.

- [ ] **Step 3: Implement minimal path resolution**

Change the path import and resolver to:

```ts
import { dirname, join } from 'node:path'

export const NOTIFICATION_CONFIG_PATH = '/data/notifications.json'

export function notificationConfigPath(
  env: NodeJS.ProcessEnv = process.env,
  cwd = process.cwd(),
): string {
  if (env.PB_NOTIFICATION_CONFIG_PATH) return env.PB_NOTIFICATION_CONFIG_PATH
  if (env.NODE_ENV === 'production') return NOTIFICATION_CONFIG_PATH
  return join(cwd, '.data', 'notifications.json')
}
```

Add this under `# local tooling` in `.gitignore`:

```gitignore
/.data/
```

- [ ] **Step 4: Run the focused test and ignore assertion**

Run:

```bash
pnpm exec vitest run tests/notification-config.test.ts
git check-ignore .data/notifications.json
```

Expected: all notification config tests PASS; Git reports `.data/notifications.json` as ignored.

- [ ] **Step 5: Commit the storage fix**

```bash
git add .gitignore lib/notifications/config.ts tests/notification-config.test.ts
git commit -m "fix(notifications): persist localhost settings locally"
```

### Task 2: Return the webhook and useful Server Action errors

**Files:**
- Modify: `lib/notifications/types.ts:21-26`
- Modify: `lib/notifications/config.ts:98-104`
- Modify: `server-actions/notifications.ts:22-56`
- Test: `tests/notification-config.test.ts`
- Test: `tests/notification-actions.test.ts`

- [ ] **Step 1: Replace masking assertions with the approved authenticated contract**

Change the config test to:

```ts
it('returns the stored webhook to authenticated Settings data', () => {
  const config = {
    ...DEFAULT_NOTIFICATION_CONFIG,
    webhookUrl: 'https://discord.com/api/webhooks/123/super-secret-token',
  }

  expect(toPublicNotificationSettings(config, 'ready')).toEqual({
    ...config,
    configured: true,
    status: 'ready',
  })
})
```

Change the successful action test to assert:

```ts
expect(result).toEqual(expect.objectContaining({
  ok: true,
  settings: expect.objectContaining({
    configured: true,
    webhookUrl: 'https://discord.com/api/webhooks/123/token-value',
  }),
}))
```

- [ ] **Step 2: Add failing action-result tests**

Import `writeFile` and add tests that assert:

```ts
it.each([
  [{ webhookUrl: 'https://example.com/not-discord' }, 'Enter a valid Discord webhook URL.'],
  [{ username: '' }, 'Enter a Discord username.'],
  [{ avatarUrl: 'http://example.com/avatar.png' }, 'Avatar URL must use HTTPS.'],
])('returns a useful validation error for %o', async (override, expected) => {
  const { saveNotificationSettings } = await import('@/server-actions/notifications')
  const result = await saveNotificationSettings({
    enabled: true,
    webhookUrl: 'https://discord.com/api/webhooks/123/token-value',
    username: 'Pocketbook',
    avatarUrl: null,
    events: DEFAULT_NOTIFICATION_CONFIG.events,
    ...override,
  })

  expect(result).toEqual({ ok: false, error: expected })
})

it('returns a safe error when notification storage is unwritable', async () => {
  const root = await mkdtemp(join(tmpdir(), 'pocketbook-notification-blocked-'))
  const blocker = join(root, 'not-a-directory')
  await writeFile(blocker, 'blocked')
  process.env.PB_NOTIFICATION_CONFIG_PATH = join(blocker, 'notifications.json')
  const { saveNotificationSettings } = await import('@/server-actions/notifications')

  await expect(saveNotificationSettings({
    enabled: true,
    webhookUrl: 'https://discord.com/api/webhooks/123/token-value',
    username: 'Pocketbook',
    avatarUrl: null,
    events: DEFAULT_NOTIFICATION_CONFIG.events,
  })).resolves.toEqual({
    ok: false,
    error: 'Could not save notification settings. Check that the notification data directory is writable.',
  })
})
```

- [ ] **Step 3: Run the tests and verify they fail for the old behavior**

Run:

```bash
pnpm exec vitest run tests/notification-config.test.ts tests/notification-actions.test.ts
```

Expected: FAIL because the webhook is stripped and expected validation/storage failures throw.

- [ ] **Step 4: Expose the webhook through the authenticated view type**

Change the type and mapper to:

```ts
export type PublicNotificationSettings = NotificationConfigV1 & {
  configured: boolean
  status: NotificationConfigStatus
}
```

```ts
export function toPublicNotificationSettings(
  config: NotificationConfigV1,
  status: NotificationConfigStatus,
): PublicNotificationSettings {
  return { ...config, configured: Boolean(config.webhookUrl), status }
}
```

- [ ] **Step 5: Return specific validation and storage results**

Import `validateDiscordWebhookUrl`. Define the action schema fields as:

```ts
webhookUrl: z.string().trim().max(2048).refine(
  (value) => value === '' || validateDiscordWebhookUrl(value),
  'Enter a valid Discord webhook URL.',
),
username: z.string().trim().min(1, 'Enter a Discord username.').max(80),
avatarUrl: z.string().trim().max(2048).nullable().refine(
  (value) => value === null || value === '' || (() => {
    try {
      return new URL(value).protocol === 'https:'
    } catch {
      return false
    }
  })(),
  'Avatar URL must use HTTPS.',
),
```

Replace `.parse(input)` with:

```ts
const validated = notificationSettingsInputSchema.safeParse(input)
if (!validated.success) {
  return {
    ok: false as const,
    error: validated.error.issues[0]?.message ?? 'Check the notification settings and try again.',
  }
}
const parsed = validated.data
```

Wrap only the configuration write in:

```ts
let config: NotificationConfigV1
try {
  config = await writeNotificationConfig({
    version: 1,
    enabled: parsed.enabled,
    webhookUrl,
    username: parsed.username,
    avatarUrl: parsed.avatarUrl || null,
    events: parsed.events,
  })
} catch {
  return {
    ok: false as const,
    error: 'Could not save notification settings. Check that the notification data directory is writable.',
  }
}
```

Import `NotificationConfigV1` as a type for the local variable.

- [ ] **Step 6: Run the focused tests**

```bash
pnpm exec vitest run tests/notification-config.test.ts tests/notification-actions.test.ts
```

Expected: both files PASS, including authentication, visible webhook, disconnect, validation, and storage failures.

- [ ] **Step 7: Commit the authenticated contract and errors**

```bash
git add lib/notifications/types.ts lib/notifications/config.ts server-actions/notifications.ts tests/notification-config.test.ts tests/notification-actions.test.ts
git commit -m "fix(notifications): report settings save failures"
```

### Task 3: Display the saved webhook in a normal URL field

**Files:**
- Modify: `app/(app)/settings/NotificationSettings.tsx:31-64,100-113`
- Create: `tests/notification-settings-ui.test.ts`

- [ ] **Step 1: Write the failing static UI contract**

Create:

```ts
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const source = readFileSync('app/(app)/settings/NotificationSettings.tsx', 'utf8')

describe('notification settings UI', () => {
  it('shows the stored webhook as an editable URL', () => {
    expect(source).toContain("useState(initialSettings.webhookUrl ?? '')")
    expect(source).toContain('type="url"')
    expect(source).not.toContain('type="password"')
    expect(source).toContain("setWebhookUrl(result.settings.webhookUrl ?? '')")
  })

  it('does not blame URLs for unexpected transport failures', () => {
    expect(source).toContain("toast.error('Could not save notification settings. Try again.')")
    expect(source).not.toContain('Check the webhook and avatar URLs, then try again.')
  })
})
```

- [ ] **Step 2: Run it and verify the old UI fails**

```bash
pnpm exec vitest run tests/notification-settings-ui.test.ts
```

Expected: FAIL on empty initialization, password input, post-save clearing, and the misleading toast.

- [ ] **Step 3: Implement the approved UI**

Initialize and preserve the returned value:

```ts
const [webhookUrl, setWebhookUrl] = useState(initialSettings.webhookUrl ?? '')
```

```ts
setSettings(result.settings)
setWebhookUrl(result.settings.webhookUrl ?? '')
```

Use this input:

```tsx
<Input
  id="discord-webhook"
  type="url"
  autoComplete="off"
  autoCapitalize="none"
  spellCheck={false}
  value={webhookUrl}
  onChange={(event) => setWebhookUrl(event.target.value)}
  placeholder="https://discord.com/api/webhooks/…"
/>
```

Replace the helper and fallback error with:

```tsx
<p className="text-[10.5px] text-muted-foreground">
  This URL can post to your Discord channel. Keep it private.
</p>
```

```ts
toast.error('Could not save notification settings. Try again.')
```

Disconnect continues calling `setWebhookUrl('')` after the server removes the URL.

- [ ] **Step 4: Run UI and action tests**

```bash
pnpm exec vitest run tests/notification-settings-ui.test.ts tests/notification-actions.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit the UI fix**

```bash
git add 'app/(app)/settings/NotificationSettings.tsx' tests/notification-settings-ui.test.ts
git commit -m "fix(settings): show the saved Discord webhook"
```

### Task 4: Update source-of-truth documentation and verify the patch

**Files:**
- Modify: `README.md:142`
- Modify: `DEPLOY.md` Discord settings section
- Modify locally ignored: `AGENTS.md`, `other/handoffs/v5-handoff/03-screens.md`, `other/handoffs/v5-handoff/source/calm5/Settings.jsx`, `graphify-out/wiki/how-the-app-works.md`, `other/docs/memory.md`, `other/docs/checklist.md`, `other/docs/teachables.md`
- Modify: `package.json` through the repository land/version workflow

- [ ] **Step 1: Update current behavior claims**

Replace claims that the webhook is write-only or never returned with:

```markdown
The authenticated Settings page displays the saved webhook in an editable URL field.
Treat it as a credential: anyone holding it can post to the Discord channel.
```

Document that direct development runs use `.data/notifications.json`, production uses `/data/notifications.json`, and `PB_NOTIFICATION_CONFIG_PATH` overrides both.

- [ ] **Step 2: Update design sources and project memory**

Change the v5 Settings source/spec from a write-only placeholder to a populated URL field. Record the localhost `/data` root cause, authenticated-display decision, and regression coverage in memory/checklist/teachables and the architecture wiki.

- [ ] **Step 3: Run complete verification**

```bash
pnpm test
pnpm lint
pnpm exec tsc --noEmit
pnpm build
docker compose config --quiet
git diff --check
sh -n entrypoint.sh
```

Expected: all tests pass; lint has 0 errors and only the two known React Hook Form warnings; typecheck, build, Compose, diff, and shell checks pass.

- [ ] **Step 4: Verify localhost storage without transmitting a real webhook**

Use a syntactically valid fake URL in the authenticated localhost Settings page, click Save, and verify:

- the URL remains visible;
- the success toast appears;
- `.data/notifications.json` exists with mode `0600`;
- no Discord test is sent.

Then Disconnect and verify the field clears and the stored value becomes `null`.

- [ ] **Step 5: Refresh the graph and search for stale claims**

```bash
pnpm graph:update
rg -n "write-only webhook|never returned|never sends the stored URL|paste to replace" README.md DEPLOY.md AGENTS.md other/handoffs graphify-out/wiki design-system || true
```

Expected: graph refresh succeeds and no current source-of-truth file retains the old behavior.

- [ ] **Step 6: Commit documentation**

```bash
git add README.md DEPLOY.md docs/superpowers/specs/2026-08-19-localhost-notification-settings-design.md docs/superpowers/plans/2026-08-19-localhost-notification-settings.md
git commit -m "docs: explain notification settings storage"
```

- [ ] **Step 7: Land as a patch release**

Use the repository-local `/land auto` workflow. The highest code signal is `fix`, so bump `2.11.0` to `2.11.1`; do not tag locally. Wait for PR checks, merge through GitHub, then verify the CI-owned release and GHCR image publication.
