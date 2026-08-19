// Reports what each route actually ships to the browser.
//
// Next 16 builds with Turbopack, which no longer prints a first-load size column,
// so this walks the build output instead:
//   - `.next/build-manifest.json`              -> the shared shell every route loads
//   - `.next/server/app/**/*_client-reference-manifest.js` -> a route's eager chunks
//   - `.next/static/chunks/*.js`               -> grep for library signatures
//
// A chunk that appears in no route manifest is lazily loaded (behind `next/dynamic`),
// which is the state we want for anything heavy and interaction-only.
//
// Usage: pnpm build && pnpm analyze:bundle

import { readFileSync, statSync, readdirSync, existsSync } from 'node:fs';
import { execSync } from 'node:child_process';
import path from 'node:path';

const NEXT = '.next';

if (!existsSync(`${NEXT}/build-manifest.json`)) {
  console.error('No build output found. Run `pnpm build` first.');
  process.exit(1);
}

const sizeOf = (f) => {
  try {
    return statSync(path.join(NEXT, f)).size;
  } catch {
    return 0;
  }
};
const kb = (b) => (b / 1024).toFixed(1).padStart(8) + ' KB';

// The shell is loaded by every route, so it is the floor for all of them.
const buildManifest = JSON.parse(readFileSync(`${NEXT}/build-manifest.json`, 'utf8'));
const shell = new Set([
  ...(buildManifest.rootMainFiles ?? []),
  ...(buildManifest.polyfillFiles ?? []),
]);

const manifests = execSync(`find ${NEXT}/server/app -name '*_client-reference-manifest.js'`)
  .toString()
  .trim()
  .split('\n')
  .filter(Boolean);

const routes = [];
const eagerChunks = new Set();

for (const manifest of manifests) {
  const route =
    manifest
      .replace(`${NEXT}/server/app`, '')
      .replace(/\/?(page|route)_client-reference-manifest\.js$/, '') || '/';

  // API routes and metadata handlers ship no client JS.
  if (route.startsWith('/api') || route.includes('favicon') || route.includes('webmanifest')) {
    continue;
  }

  const referenced = readFileSync(manifest, 'utf8').match(/static\/chunks\/[^"\\]+\.js/g) ?? [];
  referenced.forEach((c) => eagerChunks.add(c));

  const chunks = new Set([...shell, ...referenced]);
  let total = 0;
  for (const chunk of chunks) total += sizeOf(chunk);
  routes.push({ route, count: chunks.size, total });
}

routes.sort((a, b) => b.total - a.total);

console.log('== Per-route client JS (uncompressed, eager only) ==\n');
console.log('Route'.padEnd(30) + 'chunks'.padStart(7) + 'client JS'.padStart(14));
for (const r of routes) {
  console.log(r.route.padEnd(30) + String(r.count).padStart(7) + kb(r.total));
}

let shellTotal = 0;
for (const chunk of shell) shellTotal += sizeOf(chunk);
console.log('\nShared shell: ' + kb(shellTotal) + `  (${shell.size} chunks)`);

const allChunks = readdirSync(`${NEXT}/static/chunks`).filter((f) => f.endsWith('.js'));
let allTotal = 0;
for (const f of allChunks) allTotal += sizeOf(`static/chunks/${f}`);
console.log('All static chunks: ' + kb(allTotal) + `  (${allChunks.length} files)`);

// Signatures are strings the library emits at runtime. Tailwind arbitrary variants
// can embed a library's class names in a *component* chunk (e.g. `[&_.react-colorful]`),
// so each probe below is a token that only the library itself produces.
const probes = {
  'react-day-picker': 'day_button',
  'react-colorful': 'react-colorful__last-control',
  'date-fns': 'date-fns',
  'lucide-react': 'lucide',
  sonner: 'sonner',
  cmdk: 'cmdk-',
};

console.log('\n== Library attribution ==\n');
for (const [lib, pattern] of Object.entries(probes)) {
  const hits = allChunks.filter((f) =>
    readFileSync(`${NEXT}/static/chunks/${f}`, 'utf8').includes(pattern),
  );
  if (!hits.length) {
    console.log(lib.padEnd(20) + '        — not in bundle');
    continue;
  }
  const total = hits.reduce((sum, f) => sum + sizeOf(`static/chunks/${f}`), 0);
  const lazy = hits.every((f) => !eagerChunks.has(`static/chunks/${f}`));
  console.log(lib.padEnd(20) + kb(total) + (lazy ? '   [lazy]' : '   [eager]'));
}
