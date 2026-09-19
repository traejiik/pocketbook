import { prisma } from './prisma'
import { parseCsvRecords } from './csv'
import { DEFAULT_BACKFILL_MONTHS } from './recurring-backfill'
import {
  createRecurringRule,
  installmentError,
  lockRates,
  planNewRule,
  recurringRuleSchema,
  type RecurringRuleFields,
} from './recurring-create'

// Recurring rules import in the same preview → review → commit shape as
// transactions (see lib/import-transactions.ts). Creating a rule can log past
// charges, so the preview shows each rule's catch-up before anything is written.

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const KINDS = ['INCOME', 'EXPENSE', 'SAVINGS'] as const
const CYCLES = ['MONTHLY', 'ANNUAL'] as const
const CURRENCIES = ['HUF', 'USD', 'EUR', 'GBP'] as const

function isRealDate(iso: string): boolean {
  if (!DATE_RE.test(iso)) return false
  const d = new Date(iso + 'T00:00:00Z')
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === iso
}

export type RecurringImportValue = Omit<RecurringRuleFields, 'id' | 'categoryId'> & {
  categoryId?: string
  categoryName?: string
}

export type ParsedRecurringRow = { line: number; value: RecurringImportValue | null; errors: string[] }

const CYCLE_ALIASES: Record<string, (typeof CYCLES)[number]> = {
  MONTHLY: 'MONTHLY', MONTH: 'MONTHLY', ANNUAL: 'ANNUAL', ANNUALLY: 'ANNUAL', YEARLY: 'ANNUAL', YEAR: 'ANNUAL',
}

function optionalInt(raw: string, label: string, min: number, errors: string[]): number | null {
  if (!raw) return null
  const n = Number(raw)
  if (!Number.isInteger(n) || n < min) {
    errors.push(`Invalid ${label} "${raw}"`)
    return null
  }
  return n
}

/**
 * Columns: `name, amount, currency, cycle, next_due, kind` (or `type`), a
 * category as `category` (name) or `category_id`, and optional
 * `installment_paid, installment_total, installment_ends_on`. `amount` is the
 * size of one charge; its sign is ignored. A row with an installment column is
 * an installment plan.
 */
export function parseRecurringRows(csv: string): ParsedRecurringRow[] {
  const { headers, records } = parseCsvRecords(csv)
  const missing = ['name', 'amount', 'currency', 'cycle', 'next_due'].filter((h) => !headers.includes(h))
  if (!headers.includes('kind') && !headers.includes('type')) missing.push('kind')
  if (records.length > 0 && missing.length > 0) {
    return [{ line: 1, value: null, errors: [`Missing column${missing.length === 1 ? '' : 's'}: ${missing.join(', ')}`] }]
  }

  return records.map(({ line, values: v }) => {
    const errors: string[] = []
    if (!v.name) errors.push('Name is required')
    if (v.name.length > 200) errors.push('Name is longer than 200 characters')
    const amount = Math.abs(Number(v.amount.replace(/\s/g, '').replace(/^−/, '-')))
    if (!v.amount || !Number.isFinite(amount) || amount === 0) errors.push(`Invalid amount "${v.amount}"`)
    const currency = v.currency.toUpperCase()
    if (!(CURRENCIES as readonly string[]).includes(currency)) errors.push(`Unsupported currency "${v.currency}"`)
    const cycle = CYCLE_ALIASES[v.cycle.toUpperCase()]
    if (!cycle) errors.push(`Invalid cycle "${v.cycle}" (expected MONTHLY or ANNUAL)`)
    if (!isRealDate(v.next_due)) errors.push(`Invalid next_due "${v.next_due}" (expected YYYY-MM-DD)`)
    const kind = (v.kind || v.type || '').toUpperCase()
    if (!(KINDS as readonly string[]).includes(kind)) errors.push(`Invalid kind "${v.kind || v.type}" (expected INCOME, EXPENSE or SAVINGS)`)

    const installmentPaid = optionalInt(v.installment_paid ?? '', 'installment_paid', 0, errors)
    const installmentTotal = optionalInt(v.installment_total ?? '', 'installment_total', 1, errors)
    const endsOn = v.installment_ends_on ?? ''
    if (endsOn && !isRealDate(endsOn)) errors.push(`Invalid installment_ends_on "${endsOn}"`)
    const hasInstallment = installmentPaid !== null || installmentTotal !== null || !!endsOn

    if (errors.length > 0) return { line, value: null, errors }
    const value: RecurringImportValue = {
      name: v.name,
      amount,
      currency: currency as (typeof CURRENCIES)[number],
      cycle,
      nextDue: v.next_due,
      kind: kind as (typeof KINDS)[number],
      categoryId: v.category_id || undefined,
      categoryName: v.category || undefined,
      hasInstallment,
      installmentPaid,
      installmentTotal,
      installmentEndsOn: endsOn || null,
      // The review sheet decides how much history to log; these are its defaults.
      backfill: true,
      backfillMonths: DEFAULT_BACKFILL_MONTHS,
    }
    const invalid = installmentError({ ...value, categoryId: 'x' })
    return invalid ? { line, value: null, errors: [invalid] } : { line, value, errors }
  })
}

export type RecurringPreviewRow = {
  line: number
  status: 'new' | 'duplicate' | 'error'
  messages: string[]
  /** The rule as it would be created (null for error rows); `categoryId` null until one is picked. */
  rule: (Omit<RecurringRuleFields, 'id' | 'categoryId'> & { categoryId: string | null }) | null
  /** A category name the file carried that matched nothing, so the review can offer to create it. */
  unmatchedCategory: string | null
  /** Charges creating the rule would log now, and the next due date it would be left with. */
  backfill: { count: number; from: string | null; to: string | null; nextDue: string } | null
}

type Client = Pick<typeof prisma, 'category' | 'recurringRule'>

/** Read-only: resolve categories, flag names already used by an active rule, and plan each rule's catch-up. */
export async function classifyRecurringRows(
  parsed: ParsedRecurringRow[],
  client: Client = prisma,
  today?: Date,
): Promise<RecurringPreviewRow[]> {
  const [categories, active] = await Promise.all([
    client.category.findMany({ select: { id: true, name: true, kind: true } }),
    client.recurringRule.findMany({ where: { archived: false }, select: { name: true } }),
  ])
  const catById = new Map(categories.map((c) => [c.id, c]))
  const catByName = new Map(categories.map((c) => [`${c.kind}|${c.name.trim().toLowerCase()}`, c]))
  const taken = new Set(active.map((r) => r.name.trim().toLowerCase()))
  const seen = new Set<string>()

  return parsed.map(({ line, value, errors }): RecurringPreviewRow => {
    if (!value) return { line, status: 'error', messages: errors, rule: null, unmatchedCategory: null, backfill: null }

    const { categoryId: fileCategoryId, categoryName, ...fields } = value
    const messages: string[] = []
    let categoryId: string | null = null
    let unmatchedCategory: string | null = null
    if (fileCategoryId) {
      const cat = catById.get(fileCategoryId)
      if (!cat) messages.push(`Category id "${fileCategoryId}" not found — pick one`)
      else if (cat.kind !== value.kind) messages.push(`"${cat.name}" is not a ${value.kind.toLowerCase()} category — pick one`)
      else categoryId = cat.id
    } else if (categoryName) {
      const cat = catByName.get(`${value.kind}|${categoryName.trim().toLowerCase()}`)
      if (cat) categoryId = cat.id
      else {
        unmatchedCategory = categoryName
        messages.push(`No ${value.kind.toLowerCase()} category named "${categoryName}" — pick one or create it`)
      }
    } else {
      messages.push('No category in the file — pick one')
    }

    const key = value.name.trim().toLowerCase()
    let status: RecurringPreviewRow['status'] = 'new'
    if (taken.has(key)) {
      status = 'duplicate'
      messages.unshift('An active rule already has this name')
    } else if (seen.has(key)) {
      status = 'duplicate'
      messages.unshift('Repeats an earlier rule in this file')
    }
    seen.add(key)

    const plan = planNewRule({ ...fields, categoryId: categoryId ?? '' }, today)
    return {
      line,
      status,
      messages,
      rule: { ...fields, categoryId },
      unmatchedCategory,
      backfill: {
        count: plan.transactions.length,
        from: plan.transactions[0]?.date ?? null,
        to: plan.transactions.at(-1)?.date ?? null,
        nextDue: plan.nextDue,
      },
    }
  })
}

export type RecurringImportResult = { imported: number; skipped: number; backfilled: number; errors: string[] }

/**
 * Create the reviewed rules in one transaction. Rows come back from the browser,
 * so each is re-validated and its name and category re-checked against the
 * database as it is now.
 */
export async function commitRecurringRows(input: unknown[], today?: Date): Promise<RecurringImportResult> {
  const errors: string[] = []
  const rules: RecurringRuleFields[] = []
  input.forEach((raw, i) => {
    const parsed = recurringRuleSchema.safeParse(raw)
    if (!parsed.success) {
      errors.push(`Row ${i + 1}: ${parsed.error.issues.map((e) => `${e.path.join('.')} ${e.message}`).join('; ')}`)
      return
    }
    const invalid = installmentError(parsed.data)
    if (invalid) errors.push(`"${parsed.data.name}": ${invalid}`)
    else rules.push({ ...parsed.data, id: undefined })
  })

  const locks = await lockRates(rules.map((r) => r.currency))
  const result = await prisma.$transaction(async (tx) => {
    const [categories, active] = await Promise.all([
      tx.category.findMany({ select: { id: true, kind: true } }),
      tx.recurringRule.findMany({ where: { archived: false }, select: { name: true } }),
    ])
    const kindOf = new Map(categories.map((c) => [c.id, c.kind]))
    const taken = new Set(active.map((r) => r.name.trim().toLowerCase()))

    let imported = 0, skipped = 0, backfilled = 0
    for (const rule of rules) {
      const key = rule.name.trim().toLowerCase()
      if (taken.has(key)) {
        errors.push(`Skipped "${rule.name}": an active rule already has this name`)
        skipped++
        continue
      }
      if (kindOf.get(rule.categoryId) !== rule.kind) {
        errors.push(`Skipped "${rule.name}": category does not exist or does not match ${rule.kind.toLowerCase()}`)
        skipped++
        continue
      }
      taken.add(key)
      const created = await createRecurringRule(tx, rule, planNewRule(rule, today), locks.get(rule.currency)!)
      imported++
      backfilled += created.backfilled
    }
    return { imported, skipped, backfilled }
  })

  return { ...result, skipped: result.skipped + (input.length - rules.length), errors }
}
