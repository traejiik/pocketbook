BEGIN;

ALTER TABLE "RecurringRule" ADD COLUMN "cycleInterval" INTEGER NOT NULL DEFAULT 1;

ALTER TABLE "RecurringRule" ADD CONSTRAINT "RecurringRule_cadence_check"
  CHECK (
    ("cycle" = 'WEEKLY' AND "cycleInterval" BETWEEN 1 AND 52 AND "anchorDay" IS NULL)
    OR ("cycle" = 'MONTHLY' AND "cycleInterval" BETWEEN 1 AND 12)
    OR ("cycle" = 'ANNUAL' AND "cycleInterval" BETWEEN 1 AND 5)
  );

COMMIT;
