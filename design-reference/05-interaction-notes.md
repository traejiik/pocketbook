# 05 · Interaction Notes

The half-page that decides whether it feels right.

## Add transaction

The most-used form. Opens as a **right-side Sheet**, not a modal — so the table behind it stays anchored. You can scan the day's existing entries while typing.

- Hit `N` anywhere to open it. `⌘↵` submits. `Esc` closes.
- The Type segmented control (Income / Expense / Savings) is colour-coded so the form changes register **before you read it**.
- Currency conversion is shown in muted mono **under the amount field** — never as a popover, never as a tooltip.
- Category picker fuzzy-matches as you type ("groc" → Food & Groceries).

## AI Insights loading

Three states:

1. **Connecting** — connection line at top with a pulsing amber dot ("Connecting to Ollama…") and a skeleton paragraph below. Lasts ~1s.
2. **Streaming** — dot flips to primary-blue, model streams text in token-by-token with a blinking caret at the tail of the latest paragraph.
3. **Done** — dot turns green; a footer slides in with helpful / not-useful + a saved-to-disk path.

**No spinner.** **No typewriter gimmick on a pre-canned string.** It must be real streaming.

## Installment hits zero

When the last installment of a recurring rule pays off:

1. The amber installment block on the recurring card animates the progress bar to 100%.
2. It collapses into a one-line confirmation: *"Mobile contract — finished July 2026 · 300 675 Ft total paid."*
3. The rule flips to `archived`, drops out of upcoming renewals, but stays searchable.
4. On next dashboard load, a subtle toast appears: *"Mobile contract paid off."*

## Switching months on the dashboard

- KPI cards crossfade with a **180ms ease-out**. Numerals **tween between values** (don't hard-cut) — makes deltas readable at a glance.
- Bar chart re-orders (sort by value) with a **FLIP animation** so the eye tracks "this category moved up."
- Trend strip slides one bar to the left and adds the new month from the right.

## Empty states

No illustrations. The recipe:

- A single muted icon in a circle
- A tight title (4–6 words)
- A one-line body (≤14 words)
- A primary action

The app launches with seeded categories so true empty states only happen on Transactions (until you log your first) and AI Insights (first month).

## Sidebar nav

- Active item is the **primary blue pill** with a contrast icon disc.
- Hover state is `accent/60` background, no movement.
- "Renewals" carries a warning-coloured badge with the count of upcoming items in the next 30 days.
- The decorative gradient + glow are deliberately faint (~8–10% opacity) — visible but not loud.

## Top header

- Date eyebrow stays terse: `MONDAY · 18 MAY 2026` in mono uppercase, tracking wide.
- Search has a `⌘K` suffix — opens a Command palette (TBD which actions it exposes).
- Notification button shows a small expense-coloured dot when there's unread.

## Theme toggle

- Theme is **per-installation**, persisted in `localStorage`. Default: dark.
- Toggling animates the icon (sun ↔ moon) on a 200ms rotation; **the page itself does not animate** between themes — it's a hard swap.

## FX rates

- **Anchor currency** (`HUF` default) is the lens for every total in the app.
- Per-currency mode toggle: **Dynamic** (live from frankfurter.app / ECB) vs **Manual** (typed rate).
- Auto-sync runs nightly at 03:00 local for dynamic currencies. A pulsing green dot indicates the live state.
- Switching the anchor or changing a manual rate retroactively reflows all displayed totals — show a `Dialog` confirmation first.

## Loading & empty data

- **Skeletons over spinners.** Every async surface that could take >150ms gets matching-shape skeletons.
- **Optimistic writes.** Add Transaction commits to the table instantly; if the API fails, the row flashes red and undoes itself.
- **No "loading…" text anywhere.**

## Keyboard shortcuts (target set)

| Key | Action |
|---|---|
| `N` | Add transaction |
| `⌘K` | Open command palette / search |
| `G` then `D` / `T` / `R` / etc. | Jump to Dashboard / Transactions / Recurring (Linear-style) |
| `⌘↵` | Submit active form |
| `Esc` | Close active sheet / dialog |
| `?` | Show shortcuts |
