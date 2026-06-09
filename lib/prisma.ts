import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient }

function buildPrismaClient(): PrismaClient {
  const connectionString = process.env.PB_DATABASE_URL
  if (!connectionString) {
    throw new Error('PB_DATABASE_URL is not set')
  }
  const adapter = new PrismaPg({ connectionString })
  return new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
  })
}

// The client MUST be memoized in every environment. The Proxy below re-resolves
// the client on each property access — including Prisma-internal `this.x`
// accesses inside $transaction — so without a cache an interactive transaction
// opens on one client and its queries run on another, failing with P2028
// ("Transaction not found"). The Proxy exists only to defer construction past
// `next build`, where PB_DATABASE_URL is not set.
function getPrismaClient(): PrismaClient {
  if (!globalForPrisma.prisma) {
    globalForPrisma.prisma = buildPrismaClient()
  }
  return globalForPrisma.prisma
}

export const prisma = new Proxy({} as PrismaClient, {
  get(_target, prop, receiver) {
    return Reflect.get(getPrismaClient(), prop, receiver)
  },
}) as PrismaClient

async function connectWithRetry(attempts = 3, delayMs = 500): Promise<void> {
  for (let i = 1; i <= attempts; i++) {
    try {
      await prisma.$connect()
      return
    } catch (err) {
      if (i === attempts) throw err
      await new Promise((r) => setTimeout(r, delayMs * i))
    }
  }
}

if (process.env.NODE_ENV === 'production' && process.env.NEXT_PHASE !== 'phase-production-build') {
  connectWithRetry().catch((err) =>
    console.error('[db] Failed to connect after retries:', err)
  )
}
