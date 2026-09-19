import { z } from 'zod'
import { prisma } from './prisma'
import { lockRate, type FxLock } from './fx'
import { signedAmount } from './recurring-dates'
import { parseCsvRecords } from './csv'
import { reconcileInstallmentRule } from './installments'

// CSV import runs in three steps so the Settings flow can show a review before
// anything is written:
//
//   parseTransactionRows  — text → per-row values or errors (never throws)
//   classifyImportRows    — read-only DB pass: resolve categories and rules,
//                           flag duplicates (against the ledger and within the file)
//   commitImportRows      — one transaction; re-validates and re-dedupes because
//                           the reviewed rows come back from the browser
//
// `importTransactions` chains all three for the seed and the CLI script.

export const SUPPORTED_CURRENCIES = ['HUF', 'USD', 'EUR', 'GBP'] as const
export type ImportCurrency = (typeof SUPPORTED_CURRENCIES)[number]
export type ImportType = 'INCOME' | 'EXPENSE' | 'SAVINGS'

const TYPES = ['INCOME', 'EXPENSE', 'SAVINGS'] as const
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

export type ImportedRow = {
  date: string
  description: string
  /** Signed from `type`: income positive, expense and savings negative. */
  amount: number
  currency: ImportCurrency
  type: ImportType
  categoryId?: string
  categoryName?: string
  recurringRuleName?: string
}

export type ParsedImportRow = { line: number; value: ImportedRow | null; errors: string[] }

function isRealDate(iso: string): boolean {
  if (!DATE_RE.test(iso)) return false
  const d = new Date(iso + 'T00:00:00Z')
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === iso
}

/**
 * Parse CSV text into per-row results. A bad row carries its errors instead of
 * aborting the file. Columns: `date, description, amount, currency, type`, a
 * category as `category_id` or `category` (name), and optional
 * `recurring_rule_name`. Extra columns are ignored, so an export re-imports.
 */
export function parseTransactionRows(csv: string): ParsedImportRow[] {
  const { headers, records } = parseCsvRecords(csv)
  const missing = ['date', 'description', 'amount', 'currency', 'type'].filter((h) => !headers.includes(h))
  if (records.length > 0 && missing.length > 0) {
    return [{ line: 1, value: null, errors: [`Missing column${missing.length === 1 ? '' : 's'}: ${missing.join(', ')}`] }]
  }

  return records.map(({ line, values: v }) => {
    const errors: string[] = []
    if (!isRealDate(v.date)) errors.push(`Invalid date "${v.date}" (expected YYYY-MM-DD)`)
    if (!v.description) errors.push('Description is required')
    if (v.description.length > 200) errors.push('Description is longer than 200 characters')
    const amount = Number(v.amount.replace(/\s/g, '').replace(/^−/, '-'))
    if (!v.amount || !Number.isFinite(amount) || amount === 0) errors.push(`Invalid amount "${v.amount}"`)
    const currency = v.currency.toUpperCase()
    if (!(SUPPORTED_CURRENCIES as readonly string[]).includes(currency)) errors.push(`Unsupported currency "${v.currency}"`)
    const type = v.type.toUpperCase()
    if (!(TYPES as readonly string[]).includes(type)) errors.push(`Invalid type "${v.type}" (expected INCOME, EXPENSE or SAVINGS)`)
    // A missing category is not an error: the review sheet offers a picker.
    const categoryId = v.category_id || undefined
    const categoryName = v.category || undefined

    if (errors.length > 0) return { line, value: null, errors }
    return {
      line,
      errors,
      value: {
        date: v.date,
        description: v.description,
        // The sign comes from `type`, never from the file (AGENTS.md §16).
        amount: signedAmount(Math.abs(amount), type as ImportType),
        currency: currency as ImportCurrency,
        type: type as ImportType,
        categoryId,
        categoryName,
        recurringRuleName: v.recurring_rule_name || undefined,
      },
    }
  })
}

export type ImportStatus = 'new' | 'duplicate' | 'error'

export type PreviewRow = {
  line: number
  status: ImportStatus
  /** Errors for `error` rows; the reason for `duplicate`; warnings for `new`. */
  messages: string[]
  date: string
  description: string
  amount: number
  currency: string
  type: ImportType | null
  /** Resolved category, or null when the file gave none or it matched nothing — the review lets you pick one. */
  categoryId: string | null
  /** The category name the file carried but that matched nothing, so the review can offer to create it. */
  unmatchedCategory: string | null
  recurringRuleId: string | null
  recurringRuleName: string | null
}

type DupSource = { date: Date; description: string; amount: unknown; currency: string; type: string }

/** Identity used for duplicate detection: day, description, magnitude, currency, type. */
function dupKey(t: { date: string; description: string; amount: number; currency: string; type: string }): string {
  return [t.date, t.description.trim().toLowerCase(), Math.abs(t.amount).toFixed(2), t.currency, t.type].join('|')
}

function dupKeyOf(t: DupSource): string {
  return dupKey({
    date: t.date.toISOString().slice(0, 10),
    description: t.description,
    amount: Number(t.amount),
    currency: t.currency,
    type: t.type,
  })
}

type Client = Pick<typeof prisma, 'transaction' | 'category' | 'recurringRule'>

async function existingKeys(client: Client, dates: string[]): Promise<{ keys: Set<string>; ruleDays: Set<string> }> {
  if (dates.length === 0) return { keys: new Set(), ruleDays: new Set() }
  const sorted = [...dates].sort()
  const rows = await client.transaction.findMany({
    where: { date: { gte: new Date(sorted[0] + 'T00:00:00Z'), lte: new Date(sorted.at(-1)! + 'T00:00:00Z') } },
    select: { date: true, description: true, amount: true, currency: true, type: true, recurringRuleId: true },
  })
  return {
    keys: new Set(rows.map(dupKeyOf)),
    ruleDays: new Set(rows.filter((r) => r.recurringRuleId).map((r) => `${r.recurringRuleId}|${r.date.toISOString().slice(0, 10)}`)),
  }
}

/**
 * Read-only pass that turns parsed rows into reviewable preview rows: resolves
 * each category (by id, else by name within the row's kind) and rule name, and
 * marks rows that already exist in the ledger or repeat earlier in the file.
 */
export async function classifyImportRows(parsed: ParsedImportRow[], client: Client = prisma): Promise<PreviewRow[]> {
  const valid = parsed.flatMap((p) => (p.value ? [p.value] : []))
  const [categories, rules, existing] = await Promise.all([
    client.category.findMany({ select: { id: true, name: true, kind: true } }),
    client.recurringRule.findMany({ select: { id: true, name: true, archived: true } }),
    existingKeys(client, valid.map((v) => v.date)),
  ])
  const catById = new Map(categories.map((c) => [c.id, c]))
  const catByName = new Map(categories.map((c) => [`${c.kind}|${c.name.trim().toLowerCase()}`, c]))
  // Prefer an active rule when names collide with archived ones.
  const ruleByName = new Map<string, { id: string; name: string }>()
  for (const r of [...rules].sort((a, b) => Number(b.archived) - Number(a.archived))) {
    ruleByName.set(r.name.trim().toLowerCase(), r)
  }

  const seen = new Set<string>()
  return parsed.map(({ line, value, errors }): PreviewRow => {
    if (!value) {
      return {
        line, status: 'error', messages: errors, date: '', description: '', amount: 0, currency: '',
        type: null, categoryId: null, unmatchedCategory: null, recurringRuleId: null, recurringRuleName: null,
      }
    }
    const messages: string[] = []
    let categoryId: string | null = null
    let unmatchedCategory: string | null = null
    if (value.categoryId) {
      const cat = catById.get(value.categoryId)
      if (!cat) messages.push(`Category id "${value.categoryId}" not found — pick one`)
      else if (cat.kind !== value.type) messages.push(`"${cat.name}" is not a ${value.type.toLowerCase()} category — pick one`)
      else categoryId = cat.id
    } else if (value.categoryName) {
      const cat = catByName.get(`${value.type}|${value.categoryName.trim().toLowerCase()}`)
      if (cat) categoryId = cat.id
      else {
        unmatchedCategory = value.categoryName
        messages.push(`No ${value.type.toLowerCase()} category named "${value.categoryName}" — pick one or create it`)
      }
    } else {
      messages.push('No category in the file — pick one')
    }

    let recurringRuleId: string | null = null
    if (value.recurringRuleName) {
      const rule = ruleByName.get(value.recurringRuleName.trim().toLowerCase())
      if (rule) recurringRuleId = rule.id
      else messages.push(`No recurring rule named "${value.recurringRuleName}" — imported without a link`)
    }

    const key = dupKey(value)
    let status: ImportStatus = 'new'
    if (existing.keys.has(key)) {
      status = 'duplicate'
      messages.unshift('Already in your ledger')
    } else if (seen.has(key)) {
      status = 'duplicate'
      messages.unshift('Repeats an earlier row in this file')
    } else if (recurringRuleId && existing.ruleDays.has(`${recurringRuleId}|${value.date}`)) {
      status = 'duplicate'
      messages.unshift(`"${value.recurringRuleName}" is already logged on this day`)
    }
    seen.add(key)

    return {
      line, status, messages,
      date: value.date, description: value.description, amount: value.amount, currency: value.currency,
      type: value.type, categoryId, unmatchedCategory, recurringRuleId, recurringRuleName: value.recurringRuleName ?? null,
    }
  })
}

export const commitRowSchema = z.object({
  date: z.string().refine(isRealDate, 'Invalid date'),
  description: z.string().trim().min(1).max(200),
  amount: z.number().finite().refine((n) => n !== 0, 'Amount is required'),
  currency: z.enum(SUPPORTED_CURRENCIES),
  type: z.enum(TYPES),
  categoryId: z.string().min(1),
  recurringRuleId: z.string().min(1).nullable(),
})
export type CommitRow = z.infer<typeof commitRowSchema>

export type ImportResult = { imported: number; skipped: number; errors: string[]; touchedRules: boolean }

/**
 * Write reviewed rows in one transaction. Rows arrive from the browser, so each
 * is re-validated, its category and rule re-checked, and duplicates re-detected
 * against the ledger as it is *now*. Every row is stamped with the FX rate of
 * the moment (AGENTS.md §9) and installment counters are reconciled (§15).
 */
export async function commitImportRows(input: unknown[]): Promise<ImportResult> {
  const errors: string[] = []
  const rows: CommitRow[] = []
  input.forEach((raw, i) => {
    const parsed = commitRowSchema.safeParse(raw)
    if (parsed.success) rows.push(parsed.data)
    else errors.push(`Row ${i + 1}: ${parsed.error.issues.map((e) => e.message).join('; ')}`)
  })

  const locks = new Map<string, FxLock>()
  for (const currency of new Set(rows.map((r) => r.currency))) locks.set(currency, await lockRate(currency))

  const result = await prisma.$transaction(async (tx) => {
    const [categories, rules, existing] = await Promise.all([
      tx.category.findMany({ select: { id: true, kind: true } }),
      tx.recurringRule.findMany({ select: { id: true } }),
      existingKeys(tx, rows.map((r) => r.date)),
    ])
    const kindOf = new Map(categories.map((c) => [c.id, c.kind]))
    const ruleIds = new Set(rules.map((r) => r.id))

    let skipped = 0
    const data = []
    for (const row of rows) {
      if (kindOf.get(row.categoryId) !== row.type) {
        errors.push(`Skipped "${row.description}": category does not exist or does not match ${row.type.toLowerCase()}`)
        skipped++
        continue
      }
      const recurringRuleId = row.recurringRuleId && ruleIds.has(row.recurringRuleId) ? row.recurringRuleId : null
      const key = dupKey(row)
      if (existing.keys.has(key) || (recurringRuleId && existing.ruleDays.has(`${recurringRuleId}|${row.date}`))) {
        skipped++
        continue
      }
      existing.keys.add(key)
      if (recurringRuleId) existing.ruleDays.add(`${recurringRuleId}|${row.date}`)
      const lock = locks.get(row.currency)!
      data.push({
        date: new Date(row.date + 'T00:00:00Z'),
        description: row.description,
        amount: signedAmount(Math.abs(row.amount), row.type),
        currency: row.currency,
        type: row.type,
        categoryId: row.categoryId,
        recurringRuleId,
        fxRate: lock.fxRate,
        fxAnchor: lock.fxAnchor,
      })
    }

    const created = data.length > 0 ? await tx.transaction.createMany({ data, skipDuplicates: true }) : { count: 0 }
    skipped += data.length - created.count
    const touched = new Set(data.flatMap((d) => (d.recurringRuleId ? [d.recurringRuleId] : [])))
    for (const ruleId of touched) await reconcileInstallmentRule(tx, ruleId)
    return { imported: created.count, skipped, touchedRules: touched.size > 0 }
  })

  return { ...result, skipped: result.skipped + (input.length - rows.length), errors }
}

/** Non-interactive import for the seed and CLI: every `new` row with a resolved category is written. */
export async function importTransactions(csv: string): Promise<ImportResult> {
  const preview = await classifyImportRows(parseTransactionRows(csv))
  const errors: string[] = []
  const toCommit: CommitRow[] = []
  let skipped = 0
  for (const row of preview) {
    if (row.status === 'new' && row.categoryId && row.type) {
      toCommit.push({
        date: row.date, description: row.description, amount: row.amount,
        currency: row.currency as ImportCurrency, type: row.type,
        categoryId: row.categoryId, recurringRuleId: row.recurringRuleId,
      })
      continue
    }
    skipped++
    if (row.status !== 'duplicate') errors.push(`Line ${row.line}: ${row.messages.join('; ')}`)
  }
  const result = await commitImportRows(toCommit)
  return { ...result, skipped: result.skipped + skipped, errors: [...errors, ...result.errors] }
}
