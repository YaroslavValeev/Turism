-- Telegram platform action log: callback/action audit without PII.

CREATE TABLE IF NOT EXISTS "telegram_platform_action_logs" (
    "id" TEXT NOT NULL,
    "leadId" TEXT,
    "leadToken" TEXT,
    "telegramUserId" TEXT,
    "programId" TEXT,
    "organizerId" TEXT,
    "actorType" TEXT NOT NULL,
    "actorId" TEXT,
    "action" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'telegram_callback',
    "statusFrom" TEXT,
    "statusTo" TEXT,
    "propertiesJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "telegram_platform_action_logs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "telegram_platform_action_logs_leadToken_createdAt_idx"
ON "telegram_platform_action_logs"("leadToken", "createdAt");

CREATE INDEX IF NOT EXISTS "telegram_platform_action_logs_actorType_createdAt_idx"
ON "telegram_platform_action_logs"("actorType", "createdAt");
