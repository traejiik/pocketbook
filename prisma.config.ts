import 'dotenv/config';
import { defineConfig } from 'prisma/config';

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource: {
    // Built at container startup by entrypoint.sh from the PB_POSTGRES_* vars.
    // Kept PB_-prefixed (not DATABASE_URL) so the env namespace stays PB_*.
    url: process.env.PB_DATABASE_URL!,
  },
});
