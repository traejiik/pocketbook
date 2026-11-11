import { Prisma } from '@prisma/client'

// Every schedule or linked-ledger writer takes rule locks first. Ordering by
// the primary key lets an import and a relink hold multiple rules safely.
export async function lockRecurringRules(
  tx: Prisma.TransactionClient,
  ruleIds: readonly (string | null | undefined)[],
): Promise<Set<string>> {
  const ids = [...new Set(ruleIds.filter((id): id is string => id != null))]
  if (ids.length === 0) return new Set()

  const rows = await tx.$queryRaw<{ id: string }[]>`
    SELECT "id"
    FROM "RecurringRule"
    WHERE "id" IN (${Prisma.join(ids)})
    ORDER BY "id"
    FOR UPDATE
  `
  return new Set(rows.map(({ id }) => id))
}
