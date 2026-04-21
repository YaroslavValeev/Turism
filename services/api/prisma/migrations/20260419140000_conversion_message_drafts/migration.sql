-- Conversion funnel: owner-approved drafts for stages 3–5 (governance layer).
CREATE TABLE "conversion_message_drafts" (
    "id" TEXT NOT NULL,
    "organizerId" TEXT NOT NULL,
    "programId" TEXT NOT NULL,
    "stage" INTEGER NOT NULL,
    "metricsSnapshotJson" JSONB NOT NULL,
    "channel" TEXT NOT NULL,
    "messageText" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "dedupeKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewedAt" TIMESTAMP(3),
    "reviewedBy" TEXT,
    "deferredUntil" TIMESTAMP(3),
    "sentAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "ownerNotifiedAt" TIMESTAMP(3),

    CONSTRAINT "conversion_message_drafts_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "conversion_message_drafts_dedupeKey_key" ON "conversion_message_drafts"("dedupeKey");

CREATE INDEX "conversion_message_drafts_status_deferredUntil_idx" ON "conversion_message_drafts"("status", "deferredUntil");

CREATE INDEX "conversion_message_drafts_organizerId_status_idx" ON "conversion_message_drafts"("organizerId", "status");

ALTER TABLE "conversion_message_drafts" ADD CONSTRAINT "conversion_message_drafts_organizerId_fkey" FOREIGN KEY ("organizerId") REFERENCES "organizers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "conversion_message_drafts" ADD CONSTRAINT "conversion_message_drafts_programId_fkey" FOREIGN KEY ("programId") REFERENCES "programs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
