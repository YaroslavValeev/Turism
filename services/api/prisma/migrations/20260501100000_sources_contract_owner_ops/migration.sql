-- Sources contract-owner ops: external channels, lifecycle, import sessions.

-- Alter sources table with owner-operational fields.
ALTER TABLE "sources"
  ADD COLUMN "sourceOrigin" TEXT NOT NULL DEFAULT 'manual',
  ADD COLUMN "lifecycleState" TEXT NOT NULL DEFAULT 'active',
  ADD COLUMN "lastErrorAt" TIMESTAMP(3),
  ADD COLUMN "lastErrorSnippet" TEXT,
  ADD COLUMN "nextScheduledAt" TIMESTAMP(3),
  ADD COLUMN "importSessionId" TEXT;

-- Registry of organizer-owned external channels for contract-based auto source onboarding.
CREATE TABLE "organizer_external_channels" (
  "id" TEXT NOT NULL,
  "organizerId" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "urlOrHandle" TEXT NOT NULL,
  "parserProfile" TEXT,
  "fetchIntervalMinutes" INTEGER NOT NULL DEFAULT 1440,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "sourceOrigin" TEXT NOT NULL DEFAULT 'organizer_contract_auto',
  "lifecycleState" TEXT NOT NULL DEFAULT 'active',
  "autoPublish" BOOLEAN NOT NULL DEFAULT false,
  "metaJson" JSONB,
  "lastSyncedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "organizer_external_channels_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "organizer_external_channels_organizerId_type_urlOrHandle_key"
  ON "organizer_external_channels"("organizerId", "type", "urlOrHandle");
CREATE INDEX "organizer_external_channels_organizerId_isActive_idx"
  ON "organizer_external_channels"("organizerId", "isActive");
CREATE INDEX "organizer_external_channels_type_isActive_idx"
  ON "organizer_external_channels"("type", "isActive");

ALTER TABLE "organizer_external_channels"
  ADD CONSTRAINT "organizer_external_channels_organizerId_fkey"
  FOREIGN KEY ("organizerId") REFERENCES "organizers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Import sessions and per-row report for XLSX/CSV/JSON source import.
CREATE TABLE "source_import_sessions" (
  "id" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'created',
  "sourceFileName" TEXT,
  "sourceFormat" TEXT NOT NULL DEFAULT 'xlsx',
  "sourceOrigin" TEXT NOT NULL DEFAULT 'batch_import',
  "startedBy" TEXT,
  "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "finishedAt" TIMESTAMP(3),
  "dryRun" BOOLEAN NOT NULL DEFAULT false,
  "createdCount" INTEGER NOT NULL DEFAULT 0,
  "updatedCount" INTEGER NOT NULL DEFAULT 0,
  "skippedCount" INTEGER NOT NULL DEFAULT 0,
  "duplicateCount" INTEGER NOT NULL DEFAULT 0,
  "errorCount" INTEGER NOT NULL DEFAULT 0,
  "summaryJson" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "source_import_sessions_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "source_import_sessions_status_startedAt_idx"
  ON "source_import_sessions"("status", "startedAt");

CREATE TABLE "source_import_rows" (
  "id" TEXT NOT NULL,
  "sessionId" TEXT NOT NULL,
  "sheetName" TEXT,
  "rowNumber" INTEGER,
  "sourceType" TEXT,
  "urlOrHandle" TEXT,
  "sourceName" TEXT,
  "action" TEXT,
  "errorMessage" TEXT,
  "sourceId" TEXT,
  "normalizedJson" JSONB,
  "rawJson" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "source_import_rows_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "source_import_rows_sessionId_action_idx"
  ON "source_import_rows"("sessionId", "action");

ALTER TABLE "source_import_rows"
  ADD CONSTRAINT "source_import_rows_sessionId_fkey"
  FOREIGN KEY ("sessionId") REFERENCES "source_import_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- New sources indexes and import session relation.
CREATE INDEX "sources_sourceOrigin_isActive_idx" ON "sources"("sourceOrigin", "isActive");
CREATE INDEX "sources_organizerId_sourceOrigin_idx" ON "sources"("organizerId", "sourceOrigin");

ALTER TABLE "sources"
  ADD CONSTRAINT "sources_importSessionId_fkey"
  FOREIGN KEY ("importSessionId") REFERENCES "source_import_sessions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
