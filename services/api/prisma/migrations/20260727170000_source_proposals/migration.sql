-- Intake only. This does not create sources, organizers, programs, or jobs.

CREATE TABLE "source_proposals" (
    "id" TEXT NOT NULL,
    "normalizedUrl" TEXT NOT NULL,
    "detectedType" TEXT NOT NULL,
    "displayName" TEXT,
    "organizerName" TEXT,
    "notes" TEXT,
    "submittedVia" TEXT NOT NULL,
    "submittedBy" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "rejectionReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "source_proposals_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "source_proposals_status_createdAt_idx"
ON "source_proposals"("status", "createdAt");

CREATE INDEX "source_proposals_normalizedUrl_idx"
ON "source_proposals"("normalizedUrl");

CREATE UNIQUE INDEX "source_proposals_pending_normalized_url_key"
ON "source_proposals"("normalizedUrl")
WHERE "status" = 'pending';
