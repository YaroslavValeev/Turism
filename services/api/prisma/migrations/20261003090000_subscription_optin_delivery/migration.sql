ALTER TABLE "update_subscriptions"
  ADD COLUMN "identityKey" TEXT,
  ADD COLUMN "consentAt" TIMESTAMP(3),
  ADD COLUMN "levelRequired" TEXT,
  ADD COLUMN "dateFrom" DATE,
  ADD COLUMN "dateTo" DATE,
  ADD COLUMN "telegramChatId" TEXT,
  ADD COLUMN "telegramBoundAt" TIMESTAMP(3),
  ADD COLUMN "telegramTokenHash" TEXT,
  ADD COLUMN "telegramTokenExpiresAt" TIMESTAMP(3);

CREATE UNIQUE INDEX "update_subscriptions_identityKey_key" ON "update_subscriptions"("identityKey");
CREATE UNIQUE INDEX "update_subscriptions_telegramTokenHash_key" ON "update_subscriptions"("telegramTokenHash");

CREATE TABLE "subscription_deliveries" (
  "id" TEXT NOT NULL,
  "subscriptionId" TEXT NOT NULL,
  "programId" TEXT NOT NULL,
  "channel" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'sending',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completedAt" TIMESTAMP(3),
  CONSTRAINT "subscription_deliveries_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "subscription_deliveries_channel_check" CHECK ("channel" IN ('email', 'telegram')),
  CONSTRAINT "subscription_deliveries_status_check" CHECK ("status" IN ('sending', 'sent', 'uncertain')),
  CONSTRAINT "subscription_deliveries_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "update_subscriptions"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "subscription_deliveries_programId_fkey" FOREIGN KEY ("programId") REFERENCES "programs"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "subscription_deliveries_subscriptionId_programId_channel_key" ON "subscription_deliveries"("subscriptionId", "programId", "channel");
CREATE INDEX "subscription_deliveries_status_createdAt_idx" ON "subscription_deliveries"("status", "createdAt");
