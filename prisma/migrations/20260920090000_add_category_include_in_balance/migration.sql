-- Per-category switch for the running balance / month carry-over.
-- Defaults to true so every existing category — and every balance already shown —
-- is unchanged. No row backfill is needed: the balance is derived from
-- transactions on read, so toggling a category re-computes every past month.
ALTER TABLE "Category" ADD COLUMN "includeInBalance" BOOLEAN NOT NULL DEFAULT true;
