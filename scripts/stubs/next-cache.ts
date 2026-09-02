// Stand-in for `next/cache`, substituted by esbuild when a script under
// `scripts/` is bundled to run outside Next.js (`--alias:next/cache=...`).
//
// `unstable_cache` needs Next's incremental cache and throws without one, but a
// one-off script only wants the aggregation *values*, not caching. Passing the
// callback straight through keeps `lib/cache.ts` untouched (AGENTS.md rule 5)
// and the app's own bundle never sees this file.
//
// Only the two names `lib/cache.ts` imports are provided; the signatures are
// deliberately loose because nothing type-checks this against the real module.

export function unstable_cache<TArgs extends unknown[], TResult>(
  fn: (...args: TArgs) => Promise<TResult>,
): (...args: TArgs) => Promise<TResult> {
  return fn;
}

export function revalidateTag(): void {
  // Nothing is cached, so there is nothing to invalidate.
}
