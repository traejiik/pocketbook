-- Commit the enum addition before the next migration references WEEKLY.
ALTER TYPE "RecurringCycle" ADD VALUE 'WEEKLY';
