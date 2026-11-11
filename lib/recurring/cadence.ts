import { z } from 'zod'

export const recurringCycleSchema = z.enum(['WEEKLY', 'MONTHLY', 'ANNUAL'])
export type RecurringCycle = z.infer<typeof recurringCycleSchema>

export const cadenceLimits = {
  WEEKLY: 52,
  MONTHLY: 12,
  ANNUAL: 5,
} as const satisfies Record<RecurringCycle, number>

const cadenceUnits = {
  WEEKLY: 'weeks',
  MONTHLY: 'months',
  ANNUAL: 'years',
} as const satisfies Record<RecurringCycle, string>

export function isValidCadenceInterval(cycle: RecurringCycle, interval: number): boolean {
  return Number.isInteger(interval) && interval >= 1 && interval <= cadenceLimits[cycle]
}

export const recurringCadenceSchema = z.object({
  cycle: recurringCycleSchema,
  cycleInterval: z.number().default(1),
}).superRefine(({ cycle, cycleInterval }, ctx) => {
  if (isValidCadenceInterval(cycle, cycleInterval)) return
  ctx.addIssue({
    code: 'custom',
    path: ['cycleInterval'],
    message: `Use a whole number from 1 to ${cadenceLimits[cycle]} ${cadenceUnits[cycle]}.`,
  })
})

export function cadenceLabel({ cycle, cycleInterval }: z.output<typeof recurringCadenceSchema>): string {
  if (cycleInterval === 1) return cycle.toLowerCase()
  if (cycle === 'WEEKLY' && cycleInterval === 2) return 'fortnightly'
  if (cycle === 'MONTHLY' && cycleInterval === 3) return 'quarterly'
  return `every ${cycleInterval} ${cadenceUnits[cycle]}`
}
