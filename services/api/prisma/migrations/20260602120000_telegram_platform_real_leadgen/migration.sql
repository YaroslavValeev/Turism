-- Real Telegram leadgen: organizer contact channels and OPS callback audit log.
-- No synthetic organizer/program/lead/contact seed data is inserted by this migration.

CREATE TABLE "organizer_contact_channels" (
  "id" TEXT NOT NULL,
  "organizerId" TEXT NOT NULL,
  "programId" TEXT,
  "channelType" TEXT NOT NULL,
  "telegramChatId" TEXT,
  "username" TEXT,
  "url" TEXT,
  "verifiedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "organizer_contact_channels_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "telegram_platform_action_logs" (
  "id" TEXT NOT NULL,
  "leadId" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "actorTelegramId" TEXT,
  "callbackQueryId" TEXT,
  "metadataJson" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "telegram_platform_action_logs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "organizer_contact_channels_organizerId_channelType_idx" ON "organizer_contact_channels"("organizerId", "channelType");
CREATE INDEX "organizer_contact_channels_programId_idx" ON "organizer_contact_channels"("programId");
CREATE INDEX "telegram_platform_action_logs_leadId_createdAt_idx" ON "telegram_platform_action_logs"("leadId", "createdAt");
CREATE INDEX "telegram_platform_action_logs_callbackQueryId_idx" ON "telegram_platform_action_logs"("callbackQueryId");

ALTER TABLE "organizer_contact_channels"
  ADD CONSTRAINT "organizer_contact_channels_organizerId_fkey"
  FOREIGN KEY ("organizerId") REFERENCES "organizers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "organizer_contact_channels"
  ADD CONSTRAINT "organizer_contact_channels_programId_fkey"
  FOREIGN KEY ("programId") REFERENCES "programs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "telegram_platform_action_logs"
  ADD CONSTRAINT "telegram_platform_action_logs_leadId_fkey"
  FOREIGN KEY ("leadId") REFERENCES "leads"("id") ON DELETE CASCADE ON UPDATE CASCADE;
