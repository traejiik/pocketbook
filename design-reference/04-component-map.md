# 04 · Component Map

## shadcn primitives — base layer

Lift these straight from [ui.shadcn.com](https://ui.shadcn.com). No customisation needed beyond the token swap.

| Component | Used for |
|---|---|
| `Button` | All actions. Variants: `default` (primary blue), `outline`, `secondary`, `ghost`, `destructive`. Sizes: `sm`, `md`, `lg`, `icon`. |
| `Card` | Card surfaces. Replaced with `pb-card` utility (border + radius + bg). |
| `Input` | Text/number/password inputs. Our wrapper adds `icon` and `suffix` props. |
| `Label` | Form labels. Our variant adds an optional right-aligned `hint`. |
| `Form` | Form state + validation (use react-hook-form + zod). |
| `Select` | Native-ish dropdowns (currency, model, etc). |
| `Switch` | Booleans (auto-sync, theme toggle). |
| `Toggle Group` | Becomes `Segmented` (see custom). |
| `Tabs` | Insights screen, settings sections. |
| `Dialog` | Confirmations (delete category, switch anchor currency). |
| `Sheet` | **Add transaction drawer** — slides from right. |
| `Drawer` | Bottom drawer for mobile (if/when). |
| `Popover` | Filter chips, calendar pickers. |
| `Dropdown Menu` | Row actions, more menus. |
| `Tooltip` | Sparse use only — only where iconography needs disambiguating. |
| `Table` | Transactions list. |
| `Badge` | Category pills, status chips. Our variant adds `color` (dot) and `kind` (tone) props. |
| `Skeleton` | Loading states. |
| `Toast (Sonner)` | Confirmations, errors. Lives bottom-right. |
| `Calendar` | Date picker for add-transaction. |
| `Command (⌘K)` | Top-bar search (placeholder wired; behaviour TBD). |
| `Separator` | Horizontal rules between settings sections. |

## Custom — finance-specific

These don't exist in shadcn. Build them yourself.

| Component | Description | Key props |
|---|---|---|
| **`AmountDisplay`** | Tabular-numeric amount, signed, currency-aware, tone-coloured. Currency suffix in muted text. | `value`, `currency`, `tone` (`income`/`expense`/`savings`/`neutral`), `size`, `signed` |
| **`CurrencyInput`** | Amount input + currency picker, with live HUF equivalent shown underneath. | `value`, `currency`, `onValue`, `onCurrency` |
| **`KpiCard`** | Dashboard metric tile. Big number, delta pill, footnote, optional accent-dot column. | `label`, `value`, `tone`, `delta`, `deltaLabel`, `footnote`, `accentDots` |
| **`KpiBig`** | The current dashboard's larger KPI variant (44px value text, "Increased from last month" footnote). Tone determines value colour only — card bg stays neutral. | `label`, `value`, `tone`, `deltaPct`, `footnote` |
| **`CategoryBadge`** | Pill with a coloured dot pulled from the category record. | `id` (category id) |
| **`RecurringRuleCard`** | Subscription card with cycle icon, next-due date, installment progress bar. | `rule` |
| **`TimelineStrip`** | Horizontal time axis with renewal markers, used on the Renewals screen. | `events`, `range` |
| **`CategoryBar`** | Bar row with category dot, gradient fill, value + percent — for the by-category breakdown. | `cat`, `value`, `total`, `color` |
| **`PillBar`** | Vertical pill used in the dashboard's "Expenses by category" chart. Variants: `solid`, `mid` (45% opacity), `soft` (hatched, represents "remaining"). | `height`, `color`, `variant` |
| **`GaugeMeter`** | The "Income used" half-circle gauge on the dashboard. Filled arc (gradient), remaining arc (hatched), large % in centre. | `percent` |
| **`Segmented`** | Compact 2–3 segment control for view switches (Categories ↔ Trend, Dynamic ↔ Manual). | `options`, `value`, `onChange` |
| **`Sheet`** | Right-side drawer with overlay + close button. Used for Add Transaction. | `open`, `onClose`, `title`, `subtitle`, `width` |
| **`Toast`** | Bottom-right toast with success/error tones. | `visible`, `tone`, children |
| **`InsightCard`** | Conversational note container with streaming caret state (Insights screen). | `note`, `streaming` |
| **`AppShell`** | Sidebar + top header + main, all as islands with `rounded-2xl` + gaps. | children + nav state |
| **`LogoMark`** | The brand mark (gauge arc). Sizes 16/24/32+. | `size` |

## Iconography

**Lucide** at 1.6px stroke weight. The mockup ships a hand-tuned inline set (`icons.jsx`) that matches Lucide's silhouettes — you can swap to the real `lucide-react` package and the visual will hold.

| Icon | Where |
|---|---|
| `home` | Dashboard nav |
| `list` | Transactions nav, inbox button |
| `repeat` | Recurring nav, "Dynamic" toggle |
| `calendar` | Renewals nav, date inputs |
| `tag` | Categories nav |
| `sparkles` | AI insights nav + buttons |
| `settings` | Settings nav |
| `plus` | Add buttons, Quick add |
| `search` | Top bar search |
| `chevron-down/right/left` | Disclosures, breadcrumbs |
| `arrow-up/down/right` / `arrow-up-right` | Delta indicators, "open" affordances |
| `check` / `check-circle` | Confirmations, success toasts |
| `alert` | Warnings, notification badge |
| `lock` / `eye` / `eye-off` | Password fields |
| `edit` / `trash` / `more` | Row actions |
| `sun` / `moon` | Theme toggle |
| `logout` | Sign out |
| `wallet` / `currency` / `piggy` | Decorative for empty/settings/savings |

## Tone & writing in components

- Money always shows with its currency unit; HUF as `Ft` suffix (1 232 Ft), USD/EUR as `$1.23` / `€1.23` prefix.
- "−" (minus sign, not hyphen) for negative amounts.
- Dates as `18 May 2026` long-form, `18 May` short-form.
- Lowercase verbs in chips ("apply", "reset"); Title Case for buttons ("Add transaction", "View renewals").
- No exclamation marks anywhere.
