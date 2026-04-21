-- Organizer value-based conversion funnel (per program); optional telegram for organizers.

ALTER TABLE "organizers" ADD COLUMN "telegramChatId" TEXT;

CREATE TABLE "program_conversion_states" (
    "id" TEXT NOT NULL,
    "programId" TEXT NOT NULL,
    "organizerId" TEXT NOT NULL,
    "firstPublishedAt" TIMESTAMP(3) NOT NULL,
    "serviceCommsOptIn" BOOLEAN NOT NULL DEFAULT true,
    "maxStageReached" INTEGER NOT NULL DEFAULT -1,
    "stage0SentAt" TIMESTAMP(3),
    "stage1SentAt" TIMESTAMP(3),
    "stage2SentAt" TIMESTAMP(3),
    "stage3SentAt" TIMESTAMP(3),
    "stage4SentAt" TIMESTAMP(3),
    "stage5SentAt" TIMESTAMP(3),
    "stage4EligibleAt" TIMESTAMP(3),
    "followUpDueAt" TIMESTAMP(3),
    "followUpSentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "program_conversion_states_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "program_conversion_states_programId_key" ON "program_conversion_states"("programId");
CREATE INDEX "program_conversion_states_organizerId_idx" ON "program_conversion_states"("organizerId");

ALTER TABLE "program_conversion_states" ADD CONSTRAINT "program_conversion_states_programId_fkey" FOREIGN KEY ("programId") REFERENCES "programs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "program_conversion_states" ADD CONSTRAINT "program_conversion_states_organizerId_fkey" FOREIGN KEY ("organizerId") REFERENCES "organizers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "program_conversion_deliveries" (
    "id" TEXT NOT NULL,
    "programId" TEXT NOT NULL,
    "stage" INTEGER NOT NULL,
    "channel" TEXT NOT NULL,
    "dedupeKey" TEXT NOT NULL,
    "outcome" TEXT NOT NULL,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "program_conversion_deliveries_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "program_conversion_deliveries_dedupeKey_key" ON "program_conversion_deliveries"("dedupeKey");
CREATE INDEX "program_conversion_deliveries_programId_idx" ON "program_conversion_deliveries"("programId");

CREATE INDEX "analytics_events_programId_ingestedAt_idx" ON "analytics_events"("programId", "ingestedAt");
