ALTER TABLE "AppSettings"
    ADD COLUMN "bootPasswordResetArmed" BOOLEAN NOT NULL DEFAULT true,
    ADD COLUMN "lastBootPasswordResetHash" TEXT;
