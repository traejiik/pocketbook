-- Savings withdrawals: money taken back out of a SAVINGS-kind category.
-- Stored with a positive amount (the sign comes from the type, AGENTS.md rule 16).
-- Adding an enum value rewrites no rows; nothing uses it until the app writes one.
ALTER TYPE "TransactionType" ADD VALUE 'WITHDRAWAL';
