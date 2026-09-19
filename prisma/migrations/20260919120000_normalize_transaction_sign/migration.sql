-- Store every transaction's sign from its type: income positive, expense and
-- savings negative, as the app's write paths do. CSV imports used to keep the
-- file's sign, so expenses written as positive numbers landed positive. Server
-- aggregations read SUM(ABS(amount)) per type and were unaffected; this aligns
-- the stored rows with them. Idempotent: rows already signed correctly match
-- neither WHERE clause.
UPDATE "Transaction" SET "amount" = -ABS("amount") WHERE "type" IN ('EXPENSE', 'SAVINGS') AND "amount" > 0;
UPDATE "Transaction" SET "amount" = ABS("amount") WHERE "type" = 'INCOME' AND "amount" < 0;
