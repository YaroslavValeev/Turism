-- CreateTable
CREATE TABLE "update_subscriptions" (
    "id" TEXT NOT NULL,
    "email" TEXT,
    "telegramUsername" TEXT,
    "channelEmail" BOOLEAN NOT NULL DEFAULT false,
    "channelTelegram" BOOLEAN NOT NULL DEFAULT false,
    "discipline" TEXT,
    "region" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "tgOptInUrl" TEXT,
    "tgGroupInviteUrl" TEXT,
    "lastNotifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "metaJson" JSONB,

    CONSTRAINT "update_subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "update_subscriptions_status_createdAt_idx" ON "update_subscriptions"("status", "createdAt");

-- CreateIndex
CREATE INDEX "update_subscriptions_discipline_region_status_idx" ON "update_subscriptions"("discipline", "region", "status");

-- CreateIndex
CREATE INDEX "update_subscriptions_email_idx" ON "update_subscriptions"("email");

-- CreateIndex
CREATE INDEX "update_subscriptions_telegramUsername_idx" ON "update_subscriptions"("telegramUsername");
