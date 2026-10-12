import type { Prisma } from '@prisma/client';

// For an installment rule, `installmentPaid` mirrors the number of linked
// transactions and `archived` means "fully paid". Rather than increment/
// decrement in each path (which drifts the moment one is missed), recompute
// both from the live count after any create / edit / delete. This is
// self-healing: it also corrects any rule whose counter drifted previously.
export async function reconcileInstallmentRule(client: Prisma.TransactionClient, ruleId: string) {
  const rule = await client.recurringRule.findUnique({
    where: { id: ruleId },
    select: { installmentTotal: true },
  });
  if (!rule || rule.installmentTotal == null) return; // not an installment rule — nothing to track

  const paid = await client.transaction.count({ where: { recurringRuleId: ruleId } });
  await client.recurringRule.update({
    where: { id: ruleId },
    data: {
      installmentPaid: Math.min(paid, rule.installmentTotal),
      archived: paid >= rule.installmentTotal,
    },
  });
}
