import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient }

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
  })

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma

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

// Eagerly connect in production at runtime so the pool is warm on first request.
// NEXT_PHASE is set during `next build` — skip connecting then since there is no DB.
if (process.env.NODE_ENV === 'production' && process.env.NEXT_PHASE !== 'phase-production-build') {
  connectWithRetry().catch((err) =>
    console.error('[db] Failed to connect after retries:', err)
  )
}
