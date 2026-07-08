-- Telegram platform: leadgen / assisted booking layer

ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "leadToken" TEXT;
ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "telegramUserId" TEXT;
ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "sourcePostId" TEXT;
ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "deeplinkPayload" TEXT;
ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "sentToOrganizerAt" TIMESTAMP(3);
ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "organizerFirstResponseAt" TIMESTAMP(3);

CREATE UNIQUE INDEX IF NOT EXISTS "leads_leadToken_key" ON "leads"("leadToken");
CREATE INDEX IF NOT EXISTS "leads_telegramUserId_idx" ON "leads"("telegramUserId");

ALTER TABLE "bookings" ADD COLUMN IF NOT EXISTS "leadToken" TEXT;
ALTER TABLE "bookings" ADD COLUMN IF NOT EXISTS "telegramUserId" TEXT;
ALTER TABLE "bookings" ADD COLUMN IF NOT EXISTS "participantsCount" INTEGER;
ALTER TABLE "bookings" ADD COLUMN IF NOT EXISTS "childrenCount" INTEGER;
ALTER TABLE "bookings" ADD COLUMN IF NOT EXISTS "riskAcknowledged" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE "telegram_users" (
    "id" TEXT NOT NULL,
    "telegramUserId" BIGINT NOT NULL,
    "username" TEXT,
    "firstName" TEXT,
    "lastName" TEXT,
    "languageCode" TEXT,
    "phone" TEXT,
    "isBlocked" BOOLEAN NOT NULL DEFAULT false,
    "consentPdAt" TIMESTAMP(3),
    "consentContactTransferAt" TIMESTAMP(3),
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "telegram_users_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "telegram_users_telegramUserId_key" ON "telegram_users"("telegramUserId");

CREATE TABLE "telegram_sessions" (
    "id" TEXT NOT NULL,
    "telegramUserId" TEXT NOT NULL,
    "currentFlow" TEXT,
    "currentStep" TEXT,
    "stateJson" JSONB,
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "telegram_sessions_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "telegram_sessions_telegramUserId_updatedAt_idx" ON "telegram_sessions"("telegramUserId", "updatedAt");

CREATE TABLE "telegram_lead_attempts" (
    "id" TEXT NOT NULL,
    "telegramUserId" TEXT NOT NULL,
    "programId" TEXT NOT NULL,
    "organizerId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'started',
    "step" TEXT,
    "payloadJson" JSONB,
    "sourceChannel" TEXT,
    "sourcePostId" TEXT,
    "deeplinkPayload" TEXT,
    "participantsCount" INTEGER,
    "childrenCount" INTEGER,
    "expiresAt" TIMESTAMP(3),
    "submittedLeadId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "telegram_lead_attempts_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "telegram_lead_attempts_telegramUserId_status_idx" ON "telegram_lead_attempts"("telegramUserId", "status");
CREATE INDEX "telegram_lead_attempts_programId_idx" ON "telegram_lead_attempts"("programId");

CREATE TABLE "telegram_consent_records" (
    "id" TEXT NOT NULL,
    "telegramUserId" TEXT NOT NULL,
    "consentType" TEXT NOT NULL,
    "textVersion" TEXT NOT NULL,
    "acceptedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ipHash" TEXT,
    "source" TEXT,
    "leadId" TEXT,
    "bookingId" TEXT,
    CONSTRAINT "telegram_consent_records_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "telegram_consent_records_telegramUserId_consentType_idx" ON "telegram_consent_records"("telegramUserId", "consentType");

CREATE TABLE "telegram_deep_link_opens" (
    "id" TEXT NOT NULL,
    "telegramUserId" TEXT,
    "payload" TEXT NOT NULL,
    "payloadKind" TEXT,
    "programId" TEXT,
    "leadToken" TEXT,
    "sourcePostId" TEXT,
    "campaign" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "telegram_deep_link_opens_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "telegram_deep_link_opens_createdAt_idx" ON "telegram_deep_link_opens"("createdAt");
CREATE INDEX "telegram_deep_link_opens_payload_idx" ON "telegram_deep_link_opens"("payload");

CREATE TABLE "telegram_clicks" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "telegramUserId" TEXT,
    "programId" TEXT,
    "organizerId" TEXT,
    "sourcePostId" TEXT,
    "destinationUrl" TEXT NOT NULL,
    "campaign" TEXT,
    "channel" TEXT,
    "clickedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "telegram_clicks_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "telegram_clicks_token_key" ON "telegram_clicks"("token");
CREATE INDEX "telegram_clicks_programId_createdAt_idx" ON "telegram_clicks"("programId", "createdAt");

CREATE TABLE "telegram_subscriptions" (
    "id" TEXT NOT NULL,
    "telegramUserId" TEXT NOT NULL,
    "disciplineSlug" TEXT,
    "regionSlug" TEXT,
    "budgetMin" INTEGER,
    "budgetMax" INTEGER,
    "season" TEXT,
    "digestFrequency" TEXT NOT NULL DEFAULT 'weekly',
    "riskFilter" TEXT NOT NULL DEFAULT 'default',
    "kidsFilter" TEXT NOT NULL DEFAULT 'any',
    "status" TEXT NOT NULL DEFAULT 'active',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "telegram_subscriptions_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "telegram_subscriptions_telegramUserId_status_idx" ON "telegram_subscriptions"("telegramUserId", "status");

CREATE TABLE "telegram_digest_preferences" (
    "id" TEXT NOT NULL,
    "telegramUserId" TEXT NOT NULL,
    "frequency" TEXT NOT NULL DEFAULT 'weekly',
    "lastSentAt" TIMESTAMP(3),
    "preferencesJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "telegram_digest_preferences_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "telegram_digest_preferences_telegramUserId_key" ON "telegram_digest_preferences"("telegramUserId");

CREATE TABLE "organizer_contact_channels" (
    "id" TEXT NOT NULL,
    "organizerId" TEXT NOT NULL,
    "channelType" TEXT NOT NULL,
    "telegramChatId" TEXT,
    "telegramUsername" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "websiteUrl" TEXT,
    "externalUrl" TEXT,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "isVerified" BOOLEAN NOT NULL DEFAULT false,
    "lastDeliveryStatus" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "organizer_contact_channels_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "organizer_contact_channels_organizerId_channelType_idx" ON "organizer_contact_channels"("organizerId", "channelType");

CREATE TABLE "organizer_telegram_accounts" (
    "id" TEXT NOT NULL,
    "organizerId" TEXT NOT NULL,
    "telegramUserId" TEXT NOT NULL,
    "telegramAccountId" BIGINT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'operator',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "organizer_telegram_accounts_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "organizer_telegram_accounts_organizerId_telegramAccountId_key" ON "organizer_telegram_accounts"("organizerId", "telegramAccountId");

CREATE TABLE "organizer_lead_status_events" (
    "id" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "organizerId" TEXT NOT NULL,
    "fromStatus" TEXT,
    "toStatus" TEXT NOT NULL,
    "actorType" TEXT NOT NULL,
    "actorId" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "organizer_lead_status_events_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "organizer_lead_status_events_leadId_createdAt_idx" ON "organizer_lead_status_events"("leadId", "createdAt");
CREATE INDEX "organizer_lead_status_events_organizerId_createdAt_idx" ON "organizer_lead_status_events"("organizerId", "createdAt");

CREATE TABLE "telegram_reconciliation_tasks" (
    "id" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "organizerId" TEXT NOT NULL,
    "dueAt" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "result" TEXT,
    "dealAmountRub" INTEGER,
    "tripDate" TIMESTAMP(3),
    "commissionAmountRub" INTEGER,
    "comment" TEXT,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "telegram_reconciliation_tasks_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "telegram_reconciliation_tasks_status_dueAt_idx" ON "telegram_reconciliation_tasks"("status", "dueAt");
CREATE INDEX "telegram_reconciliation_tasks_organizerId_idx" ON "telegram_reconciliation_tasks"("organizerId");

CREATE TABLE "telegram_abandoned_leads" (
    "id" TEXT NOT NULL,
    "attemptId" TEXT NOT NULL,
    "telegramUserId" TEXT NOT NULL,
    "reminder2hAt" TIMESTAMP(3),
    "reminder24hAt" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'open',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "telegram_abandoned_leads_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "telegram_abandoned_leads_attemptId_key" ON "telegram_abandoned_leads"("attemptId");
CREATE INDEX "telegram_abandoned_leads_status_reminder2hAt_idx" ON "telegram_abandoned_leads"("status", "reminder2hAt");

CREATE TABLE "telegram_event_log" (
    "id" TEXT NOT NULL,
    "eventName" TEXT NOT NULL,
    "telegramUserId" TEXT,
    "programId" TEXT,
    "organizerId" TEXT,
    "leadToken" TEXT,
    "source" TEXT,
    "campaign" TEXT,
    "channelPostId" TEXT,
    "propertiesJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "telegram_event_log_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "telegram_event_log_eventName_createdAt_idx" ON "telegram_event_log"("eventName", "createdAt");
CREATE INDEX "telegram_event_log_leadToken_idx" ON "telegram_event_log"("leadToken");

ALTER TABLE "leads" ADD CONSTRAINT "leads_telegramUserId_fkey" FOREIGN KEY ("telegramUserId") REFERENCES "telegram_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_telegramUserId_fkey" FOREIGN KEY ("telegramUserId") REFERENCES "telegram_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "telegram_sessions" ADD CONSTRAINT "telegram_sessions_telegramUserId_fkey" FOREIGN KEY ("telegramUserId") REFERENCES "telegram_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "telegram_lead_attempts" ADD CONSTRAINT "telegram_lead_attempts_telegramUserId_fkey" FOREIGN KEY ("telegramUserId") REFERENCES "telegram_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "telegram_lead_attempts" ADD CONSTRAINT "telegram_lead_attempts_programId_fkey" FOREIGN KEY ("programId") REFERENCES "programs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "telegram_lead_attempts" ADD CONSTRAINT "telegram_lead_attempts_organizerId_fkey" FOREIGN KEY ("organizerId") REFERENCES "organizers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "telegram_consent_records" ADD CONSTRAINT "telegram_consent_records_telegramUserId_fkey" FOREIGN KEY ("telegramUserId") REFERENCES "telegram_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "telegram_deep_link_opens" ADD CONSTRAINT "telegram_deep_link_opens_telegramUserId_fkey" FOREIGN KEY ("telegramUserId") REFERENCES "telegram_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "telegram_clicks" ADD CONSTRAINT "telegram_clicks_telegramUserId_fkey" FOREIGN KEY ("telegramUserId") REFERENCES "telegram_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "telegram_subscriptions" ADD CONSTRAINT "telegram_subscriptions_telegramUserId_fkey" FOREIGN KEY ("telegramUserId") REFERENCES "telegram_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "telegram_digest_preferences" ADD CONSTRAINT "telegram_digest_preferences_telegramUserId_fkey" FOREIGN KEY ("telegramUserId") REFERENCES "telegram_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "organizer_contact_channels" ADD CONSTRAINT "organizer_contact_channels_organizerId_fkey" FOREIGN KEY ("organizerId") REFERENCES "organizers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "organizer_telegram_accounts" ADD CONSTRAINT "organizer_telegram_accounts_organizerId_fkey" FOREIGN KEY ("organizerId") REFERENCES "organizers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "organizer_telegram_accounts" ADD CONSTRAINT "organizer_telegram_accounts_telegramUserId_fkey" FOREIGN KEY ("telegramUserId") REFERENCES "telegram_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "organizer_lead_status_events" ADD CONSTRAINT "organizer_lead_status_events_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "leads"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "telegram_reconciliation_tasks" ADD CONSTRAINT "telegram_reconciliation_tasks_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "leads"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "telegram_abandoned_leads" ADD CONSTRAINT "telegram_abandoned_leads_attemptId_fkey" FOREIGN KEY ("attemptId") REFERENCES "telegram_lead_attempts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "telegram_abandoned_leads" ADD CONSTRAINT "telegram_abandoned_leads_telegramUserId_fkey" FOREIGN KEY ("telegramUserId") REFERENCES "telegram_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "telegram_event_log" ADD CONSTRAINT "telegram_event_log_telegramUserId_fkey" FOREIGN KEY ("telegramUserId") REFERENCES "telegram_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
