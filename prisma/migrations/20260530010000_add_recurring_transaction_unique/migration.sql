-- Prevent recurring sync reruns from creating duplicate ledger rows for the
-- same rule occurrence. PostgreSQL allows multiple NULL values in a unique
-- index, so unlinked manual transactions are unaffected.
CREATE UNIQUE INDEX "Transaction_recurringRuleId_date_key" ON "Transaction"("recurringRuleId", "date");
