ALTER TABLE "User"
    ADD COLUMN "displayName" TEXT,
    ADD COLUMN "sessionVersion" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "AppSettings"
    ADD COLUMN "instanceName" TEXT,
    ADD COLUMN "setupCodeHash" TEXT,
    ADD COLUMN "setupCodeExpiresAt" TIMESTAMP(3);
