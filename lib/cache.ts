import { revalidateTag, unstable_cache } from 'next/cache';

// Every page is `force-dynamic`, so the aggregation reads in `lib/aggregations.ts`
// re-scan and re-convert the ledger on every navigation. `force-dynamic` opts a
// route out of the full route cache but it does NOT set `fetchCache:
// 'force-no-store'`, so `unstable_cache` still caches underneath it — that's the
// lever this module provides.
//
// Data changes rarely relative to reads, so cached entries are invalidated by tag
// on write rather than by waiting for a TTL.

export const CACHE_TAGS = {
  /** Transaction rows: create/edit/delete, CSV import, recurring generation, FX re-lock. */
  transactions: 'pb-transactions',
  /** RecurringRule rows: rule CRUD, archive/unarchive, installment reconcile, nextDue advance. */
  recurring: 'pb-recurring',
  /** Category rows: name/colour/kind are denormalised into cached aggregation output. */
  categories: 'pb-categories',
  /** ExchangeRate rows *and* `AppSettings.anchorCurrency` — both change how amounts convert. */
  fx: 'pb-fx',
} as const;

export type CacheTag = (typeof CACHE_TAGS)[keyof typeof CACHE_TAGS];

// Backstop only. The tag matrix above is what actually keeps reads correct; this
// bounds staleness for the write paths that cannot call `revalidateTag` at all —
// `prisma/seed.ts` and `prisma/backfill-fx.ts` run as separate processes at
// container start, outside any Next.js request. Keep it short enough that a
// missed invalidation is an annoyance rather than wrong numbers on screen.
export const AGGREGATION_TTL_SECONDS = 300;

/**
 * Wrap an aggregation read in `unstable_cache`.
 *
 * Two constraints the callback must respect:
 *
 * 1. **Return JSON-safe values.** Cache entries round-trip through
 *    `JSON.stringify`/`JSON.parse`, but a cache *miss* returns the callback's
 *    value directly. Anything that does not survive that round-trip (a `Date`,
 *    a Prisma `Decimal`) would therefore have a different runtime shape on a hit
 *    than on a miss. Serialise inside the callback and rehydrate outside it.
 * 2. **Take every time-varying input as an argument.** Arguments are part of the
 *    cache key; values read from `new Date()` inside the callback are not, so a
 *    "current month" computed internally would be frozen into the entry.
 */
export function cachedAggregation<TArgs extends unknown[], TResult>(
  keyParts: string[],
  tags: readonly CacheTag[],
  fn: (...args: TArgs) => Promise<TResult>,
): (...args: TArgs) => Promise<TResult> {
  return unstable_cache(fn, keyParts, {
    tags: [...tags],
    revalidate: AGGREGATION_TTL_SECONDS,
  });
}

// Next 16 requires a cache-life profile on `revalidateTag`; the single-argument
// form is deprecated. `expire: 0` means "expire now" rather than "go stale and
// serve the old value while refreshing" — a write must be visible on the very
// next read, which is also what keeps Server Actions reading their own writes.
// (`updateTag` has the same semantics but throws in Route Handlers, and the FX
// and recurring cron endpoints need to invalidate too.)
const EXPIRE_NOW = { expire: 0 } as const;

/**
 * Invalidate cached aggregation reads after a write. Call this alongside the
 * existing `revalidatePath` calls, not instead of them: `revalidatePath` busts
 * the route/client-router cache, `revalidateTag` busts the data underneath it.
 */
export function revalidateFinanceTags(...tags: CacheTag[]): void {
  for (const tag of tags) revalidateTag(tag, EXPIRE_NOW);
}
