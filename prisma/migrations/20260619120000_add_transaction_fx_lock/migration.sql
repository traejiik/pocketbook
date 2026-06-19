-- Lock the FX rate per transaction at write time so historical anchor-converted
-- totals stop drifting as live rates move. Both columns are nullable: legacy rows
-- (and rows logged while a currency had no FX path) fall back to a live conversion
-- on read until edited or backfilled. Recurring rules remain live (unchanged).
ALTER TABLE "Transaction" ADD COLUMN "fxRate" DECIMAL(14,6);
ALTER TABLE "Transaction" ADD COLUMN "fxAnchor" CHAR(3);
