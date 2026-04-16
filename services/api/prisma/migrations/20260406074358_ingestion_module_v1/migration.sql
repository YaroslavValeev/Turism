-- CreateTable
CREATE TABLE "sources" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "urlOrHandle" TEXT NOT NULL,
    "discipline" TEXT,
    "country" TEXT,
    "region" TEXT,
    "language" TEXT,
    "priority" INTEGER NOT NULL DEFAULT 100,
    "trustScore" DOUBLE PRECISION NOT NULL DEFAULT 0.5,
    "parserProfile" TEXT,
    "fetchIntervalMinutes" INTEGER NOT NULL DEFAULT 60,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastCheckedAt" TIMESTAMP(3),
    "lastSuccessAt" TIMESTAMP(3),
    "metaJson" JSONB,
    "organizerId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sources_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "source_runs" (
    "id" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "runType" TEXT NOT NULL DEFAULT 'collect',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "status" TEXT NOT NULL,
    "itemsFound" INTEGER NOT NULL DEFAULT 0,
    "itemsCreated" INTEGER NOT NULL DEFAULT 0,
    "errorMessage" TEXT,
    "metaJson" JSONB,

    CONSTRAINT "source_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "raw_items" (
    "id" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "externalItemId" TEXT,
    "sourceType" TEXT NOT NULL,
    "sourceUrl" TEXT,
    "authorName" TEXT,
    "publishedAt" TIMESTAMP(3),
    "rawTitle" TEXT,
    "rawText" TEXT,
    "rawMediaJson" JSONB,
    "rawPayloadJson" JSONB,
    "contentHash" TEXT NOT NULL,
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "raw_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "normalized_items" (
    "id" TEXT NOT NULL,
    "rawItemId" TEXT NOT NULL,
    "eventType" TEXT,
    "discipline" TEXT,
    "title" TEXT,
    "descriptionShort" TEXT,
    "descriptionFull" TEXT,
    "country" TEXT,
    "region" TEXT,
    "city" TEXT,
    "venue" TEXT,
    "startDate" TIMESTAMP(3),
    "endDate" TIMESTAMP(3),
    "durationDays" INTEGER,
    "level" TEXT,
    "priceFrom" INTEGER,
    "currency" TEXT,
    "organizerName" TEXT,
    "bookingUrl" TEXT,
    "imageUrl" TEXT,
    "confidenceScore" DOUBLE PRECISION,
    "parseVersion" TEXT NOT NULL,
    "extractedJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "normalized_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "event_groups" (
    "id" TEXT NOT NULL,
    "canonicalCandidateId" TEXT,
    "groupKey" TEXT NOT NULL,
    "mergeStatus" TEXT NOT NULL DEFAULT 'open',
    "metaJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "event_groups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "event_candidates" (
    "id" TEXT NOT NULL,
    "normalizedItemId" TEXT NOT NULL,
    "dedupGroupId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'new',
    "reviewPriority" INTEGER NOT NULL DEFAULT 0,
    "trustScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "fitScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "futureEventScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "duplicateScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "finalScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "eventLikelihoodScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "completenessScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "sourceTrustScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "tourismFitScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "decisionNotes" TEXT,
    "reviewedBy" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "event_candidates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "published_programs" (
    "id" TEXT NOT NULL,
    "candidateId" TEXT NOT NULL,
    "programId" TEXT NOT NULL,
    "publishedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "publishStatus" TEXT NOT NULL,
    "editorNotes" TEXT,

    CONSTRAINT "published_programs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "sources_type_isActive_idx" ON "sources"("type", "isActive");

-- CreateIndex
CREATE INDEX "source_runs_sourceId_startedAt_idx" ON "source_runs"("sourceId", "startedAt");

-- CreateIndex
CREATE INDEX "raw_items_sourceId_fetchedAt_idx" ON "raw_items"("sourceId", "fetchedAt");

-- CreateIndex
CREATE UNIQUE INDEX "raw_items_sourceId_externalItemId_key" ON "raw_items"("sourceId", "externalItemId");

-- CreateIndex
CREATE UNIQUE INDEX "raw_items_sourceId_contentHash_key" ON "raw_items"("sourceId", "contentHash");

-- CreateIndex
CREATE UNIQUE INDEX "normalized_items_rawItemId_key" ON "normalized_items"("rawItemId");

-- CreateIndex
CREATE INDEX "normalized_items_discipline_startDate_idx" ON "normalized_items"("discipline", "startDate");

-- CreateIndex
CREATE UNIQUE INDEX "event_groups_groupKey_key" ON "event_groups"("groupKey");

-- CreateIndex
CREATE INDEX "event_candidates_status_finalScore_idx" ON "event_candidates"("status", "finalScore");

-- CreateIndex
CREATE INDEX "event_candidates_normalizedItemId_idx" ON "event_candidates"("normalizedItemId");

-- CreateIndex
CREATE UNIQUE INDEX "published_programs_candidateId_key" ON "published_programs"("candidateId");

-- CreateIndex
CREATE UNIQUE INDEX "published_programs_programId_key" ON "published_programs"("programId");

-- AddForeignKey
ALTER TABLE "sources" ADD CONSTRAINT "sources_organizerId_fkey" FOREIGN KEY ("organizerId") REFERENCES "organizers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "source_runs" ADD CONSTRAINT "source_runs_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "sources"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "raw_items" ADD CONSTRAINT "raw_items_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "sources"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "normalized_items" ADD CONSTRAINT "normalized_items_rawItemId_fkey" FOREIGN KEY ("rawItemId") REFERENCES "raw_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_candidates" ADD CONSTRAINT "event_candidates_normalizedItemId_fkey" FOREIGN KEY ("normalizedItemId") REFERENCES "normalized_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_candidates" ADD CONSTRAINT "event_candidates_dedupGroupId_fkey" FOREIGN KEY ("dedupGroupId") REFERENCES "event_groups"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "published_programs" ADD CONSTRAINT "published_programs_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "event_candidates"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "published_programs" ADD CONSTRAINT "published_programs_programId_fkey" FOREIGN KEY ("programId") REFERENCES "programs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
