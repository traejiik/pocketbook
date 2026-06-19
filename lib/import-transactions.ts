import { z } from 'zod'
import { prisma } from './prisma'
import { lockRate, type FxLock } from './fx'

const SUPPORTED_CURRENCIES = ['HUF', 'USD', 'EUR', 'GBP'] as const

const rowSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date format (expected YYYY-MM-DD)'),
  description: z.string().min(1, 'Description is required'),
  amount: z.coerce.number(),
  currency: z.enum(SUPPORTED_CURRENCIES),
  type: z.enum(['INCOME', 'EXPENSE', 'SAVINGS']),
  category_id: z.string().min(1, 'category_id is required'),
  recurring_rule_name: z.string().optional().default(''),
})

export type ImportedRow = {
  date: string
  description: string
  amount: number
  currency: (typeof SUPPORTED_CURRENCIES)[number]
  type: 'INCOME' | 'EXPENSE' | 'SAVINGS'
  categoryId: string
  recurringRuleName?: string
}

export function parseTransactionCsv(csv: string): ImportedRow[] {
  const lines = csv.trim().split('\n').filter(l => l.trim())
  if (lines.length < 2) return []

  const headers = lines[0].split(',').map(h => h.trim().toLowerCase())
  const rows: ImportedRow[] = []

  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(',').map(v => v.trim())
    const raw: Record<string, string> = {}
    headers.forEach((h, idx) => { raw[h] = values[idx] ?? '' })

    const upperCurrency = raw.currency?.toUpperCase()
    if (raw.currency && !(SUPPORTED_CURRENCIES as readonly string[]).includes(upperCurrency)) {
      throw new Error(`Unsupported currency: ${raw.currency}`)
    }

    const parsed = rowSchema.parse({
      ...raw,
      currency: upperCurrency,
      type: raw.type?.toUpperCase(),
    })

    rows.push({
      date: parsed.date,
      description: parsed.description,
      amount: parsed.amount,
      currency: parsed.currency,
      type: parsed.type,
      categoryId: parsed.category_id,
      recurringRuleName: parsed.recurring_rule_name || undefined,
    })
  }

  return rows
}

export async function importTransactions(
  csv: string
): Promise<{ imported: number; skipped: number; errors: string[] }> {
  const rows = parseTransactionCsv(csv)
  let imported = 0
  let skipped = 0
  const errors: string[] = []

  // Freeze the FX rate at import time, memoised per currency (rates don't change
  // mid-import). Imported rows behave like any other logged transaction.
  const lockByCurrency = new Map<string, FxLock>()
  const lockFor = async (currency: string): Promise<FxLock> => {
    const cached = lockByCurrency.get(currency)
    if (cached) return cached
    const lock = await lockRate(currency as 'HUF' | 'USD' | 'EUR' | 'GBP')
    lockByCurrency.set(currency, lock)
    return lock
  }

  for (const row of rows) {
    const parsedDate = new Date(row.date + 'T00:00:00Z')

    const existing = await prisma.transaction.findFirst({
      where: {
        date: parsedDate,
        description: row.description,
        amount: row.amount,
        currency: row.currency,
        type: row.type,
      },
    })
    if (existing) {
      skipped++
      continue
    }

    const category = await prisma.category.findUnique({ where: { id: row.categoryId } })
    if (!category) {
      errors.push(`Skipped "${row.description}": category "${row.categoryId}" not found`)
      skipped++
      continue
    }

    let recurringRuleId: string | null = null
    if (row.recurringRuleName) {
      const rule = await prisma.recurringRule.findFirst({ where: { name: row.recurringRuleName } })
      recurringRuleId = rule?.id ?? null
    }

    const lock = await lockFor(row.currency)
    await prisma.transaction.create({
      data: {
        date: parsedDate,
        description: row.description,
        amount: row.amount,
        currency: row.currency,
        type: row.type,
        categoryId: row.categoryId,
        recurringRuleId,
        fxRate: lock.fxRate,
        fxAnchor: lock.fxAnchor,
      },
    })
    imported++
  }

  return { imported, skipped, errors }
}
