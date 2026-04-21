-- MVP: подписки на уведомления, очередь jobs, лог доставок (дедуп / rate limit).

CREATE TABLE "notification_subscriptions" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "contactEmail" TEXT,
    "telegramChatId" TEXT,
    "channel" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "filters" JSONB NOT NULL DEFAULT '{}',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notification_subscriptions_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "notification_subscriptions_isActive_type_idx" ON "notification_subscriptions"("isActive", "type");

ALTER TABLE "notification_subscriptions" ADD CONSTRAINT "notification_subscriptions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "notification_jobs" (
    "id" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "dedupeKey" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3),

    CONSTRAINT "notification_jobs_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "notification_jobs_dedupeKey_key" ON "notification_jobs"("dedupeKey");
CREATE INDEX "notification_jobs_status_createdAt_idx" ON "notification_jobs"("status", "createdAt");

CREATE TABLE "notification_deliveries" (
    "id" TEXT NOT NULL,
    "subscriptionId" TEXT,
    "recipientChannel" TEXT NOT NULL,
    "recipientKey" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "dedupeKey" TEXT NOT NULL,
    "programId" TEXT,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notification_deliveries_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "notification_deliveries_recipientKey_sentAt_idx" ON "notification_deliveries"("recipientKey", "sentAt");

ALTER TABLE "notification_deliveries" ADD CONSTRAINT "notification_deliveries_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "notification_subscriptions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
