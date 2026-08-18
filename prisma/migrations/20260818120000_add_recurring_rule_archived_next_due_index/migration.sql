-- `RecurringRule` had no indexes at all. `getUpcomingRenewals` filters on
-- `archived` + `kind` and range-scans `nextDue`; `getRecurringRules` filters on
-- `archived` and orders by `nextDue`. Leading with the equality column lets
-- Postgres seek to the `archived = false` prefix and then read `nextDue` in
-- index order, so both the range filter and the sort are satisfied by the index.
CREATE INDEX "RecurringRule_archived_nextDue_idx" ON "RecurringRule"("archived", "nextDue");
