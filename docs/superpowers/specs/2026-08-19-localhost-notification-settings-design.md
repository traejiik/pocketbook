# Localhost Notification Settings Fix

> Revised design, 2026-08-19

## Problem

Notification settings always default to `/data/notifications.json`. That path is
correct inside the production container, where `/data` is a prepared persistent
mount, but it is not writable or normally present when Pocketbook runs directly on
macOS. Saving a valid Discord webhook therefore fails during storage preparation.
The client catches every exception and displays the same URL-validation toast, which
incorrectly blames the webhook and avatar.

The webhook field also uses `type="password"` and the server strips the stored value
before rendering Settings. Although the webhook contains a bearer token, this
single-user authenticated application intentionally prioritises inspectability and
editability: the full saved URL should be visible in Settings, as it is in comparable
self-hosted applications.

## Goals

- Make notification settings work without extra setup on `localhost:3000`.
- Preserve `/data/notifications.json` as the production container location.
- Preserve `PB_NOTIFICATION_CONFIG_PATH` as the highest-priority explicit override.
- Display the full saved webhook in a normal editable URL field on the authenticated
  Settings page.
- Keep the value visible after save and clear it only when Discord is disconnected.
- Return useful, safe validation or storage errors instead of one misleading toast.

## Non-goals

- Moving notification configuration into Prisma.
- Changing Discord delivery, event presets, or Docker persistence.
- Accepting non-Discord webhook hosts or non-HTTPS URLs.
- Exposing the webhook on unauthenticated pages or in logs, toasts, or error messages.

## Design

### Storage path

`notificationConfigPath()` resolves paths in this order:

1. `PB_NOTIFICATION_CONFIG_PATH`, when explicitly set.
2. `/data/notifications.json` when `NODE_ENV === "production"`.
3. `<process.cwd()>/.data/notifications.json` in development and test-like local
   runtimes without an override.

The repository ignores `/.data/` so a local webhook cannot be committed. Existing
atomic writes and `0600` file permissions remain unchanged.

### Server action errors

`saveNotificationSettings` validates its input without throwing expected validation
errors across the Server Action boundary. It returns `{ ok: false, error }` for:

- an invalid Discord webhook URL;
- an invalid avatar URL;
- an empty or overlong username;
- a notification configuration file that cannot be written.

Storage errors use a safe message and do not expose filesystem internals. Unexpected
client-side transport errors retain a generic fallback message.

### Settings UI

The webhook input changes from `type="password"` to `type="url"`, with spellcheck and
automatic capitalization disabled. Authenticated Settings data includes the stored
webhook URL and initializes the field with it. A successful save returns the current
value and leaves it visible. Disconnect removes it from storage and clears the field.
Helper copy identifies the URL as a credential that should not be shared.

The webhook remains protected at the application boundary: the Settings page and all
notification actions require authentication, and the value is not written to logs,
toasts, or error responses. This accepts the normal browser and extension exposure
that comes with displaying any credential in an authenticated settings form.

The client displays the specific error returned by the action. The test button still
uses the saved webhook, so the user saves before testing.

## Tests

- Path resolution selects `.data/notifications.json` locally, `/data` in production,
  and an explicit override in either environment.
- `/.data/` is ignored by Git.
- A canonical Discord webhook saves successfully through the action with a local
  configuration path.
- Invalid webhook/avatar/username inputs return field-relevant errors.
- A simulated storage failure returns a safe storage error.
- Authenticated Settings data and successful save results contain the stored webhook;
  disconnect removes it.
- Static UI coverage verifies `type="url"`, the populated field, and guards against
  restoring a password field.
- Existing atomic-write, permission, delivery, authentication, and container tests
  remain green.

## Rollout

This is a patch release. Production behavior and persisted `/data` configuration do
not migrate. Local developers with an explicit `PB_NOTIFICATION_CONFIG_PATH` keep
their existing location; otherwise the first successful save creates `.data/` in the
Pocketbook repository.
