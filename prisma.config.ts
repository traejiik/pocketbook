// Plain-object config (no `import from 'prisma/config'`).
//
// Prisma 7 requires the datasource URL here — schema files may no longer carry
// `url`. The Prisma CLI loads this file at runtime for `migrate deploy`/`db seed`
// and resolves any imports RELATIVE TO THIS FILE. In the Docker runner image,
// /app/node_modules is the slimmed Next.js standalone trace, which does not
// contain `prisma`/`@prisma/config` (prisma is only installed globally and isn't
// imported by the app, so it isn't traced). A `defineConfig` import would
// therefore fail with "Cannot find module 'prisma/config'". A plain object loads
// with zero dependencies, which is what we need on the runner.
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

// Prisma 7 dropped implicit `.env` loading, and the CLI runs outside Next.js —
// which is what loads `.env` for the app. Without this, every `pnpm db:*` command
// fails locally with "The datasource.url property is required in your Prisma
// config file", because `PB_DATABASE_URL` lives in `.env` and nothing reads it.
//
// Parsed rather than shell-sourced so values containing spaces or `$` are taken
// literally, and deliberately inlined rather than imported: this file must load
// with zero package dependencies on the Docker runner (see above), and `node:fs`
// is the only thing available there. `prisma/seed.ts` and `prisma/backfill-fx.ts`
// carry the same loader for the same reason.
//
// Real environment variables always win, and a missing file is not an error — in
// Docker neither file exists and `entrypoint.sh` exports the variable itself, so
// this is a no-op there.
for (const file of ['.env.local', '.env']) {
  try {
    const contents = readFileSync(resolve(process.cwd(), file), 'utf-8')
    for (const line of contents.split('\n')) {
      const eq = line.indexOf('=')
      if (eq > 0 && !line.startsWith('#')) {
        const k = line.slice(0, eq).trim()
        const v = line.slice(eq + 1).trim()
        if (k && !(k in process.env)) process.env[k] = v
      }
    }
  } catch {
    // File may not exist — rely on the environment already set.
  }
}

const prismaConfig = {
  schema: 'prisma/schema.prisma',
  migrations: {
    seed: 'tsx prisma/seed.ts',
  },
  datasource: {
    url: process.env.PB_DATABASE_URL,
  },
}

export default prismaConfig
