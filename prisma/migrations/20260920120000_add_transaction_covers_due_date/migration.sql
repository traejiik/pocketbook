-- "Log recurring early": a transaction entered before its rule's due date
-- records the occurrence it settles, so the daily sync does not log it again on
-- the due day. Nullable and not backfilled — existing links stay plain links.
-- The unique index stops one occurrence being settled twice (NULLs never clash).
ALTER TABLE "Transaction" ADD COLUMN "coversDueDate" DATE;

CREATE UNIQUE INDEX "Transaction_recurringRuleId_coversDueDate_key" ON "Transaction"("recurringRuleId", "coversDueDate");
