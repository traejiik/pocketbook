BEGIN;

ALTER TABLE "RecurringRule" ADD COLUMN "anchorDay" INTEGER;

-- Preserve the scheduled occurrence. Its original billing day may be unknown.
UPDATE "RecurringRule" SET "anchorDay" = EXTRACT(DAY FROM "nextDue")::INTEGER;

ALTER TABLE "RecurringRule" ADD CONSTRAINT "RecurringRule_anchorDay_check"
  CHECK ("anchorDay" BETWEEN 1 AND 31);

COMMIT;
