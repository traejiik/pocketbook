-- Starting point for the derived month-to-month carry-over. `openingBalance` is
-- the balance held on the first day of `openingBalanceMonth` (`YYYY-MM`); a null
-- month means the feature is unconfigured and carry-over starts from zero.
ALTER TABLE "AppSettings" ADD COLUMN "openingBalance" DECIMAL(14,2) NOT NULL DEFAULT 0;
ALTER TABLE "AppSettings" ADD COLUMN "openingBalanceCurrency" CHAR(3) NOT NULL DEFAULT 'HUF';
ALTER TABLE "AppSettings" ADD COLUMN "openingBalanceMonth" TEXT;
