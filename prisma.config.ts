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
