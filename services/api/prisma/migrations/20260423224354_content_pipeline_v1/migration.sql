-- CreateEnum
CREATE TYPE "ContentWorkflowStatus" AS ENUM ('ingest_collected', 'draft', 'pending_owner_review', 'approved', 'scheduled', 'publishing', 'published', 'failed', 'rejected', 'archived');

-- CreateEnum
CREATE TYPE "RawItemParseStatus" AS ENUM ('pending', 'ok', 'partial', 'failed', 'skipped_duplicate');

-- CreateEnum
CREATE TYPE "ContentDraftType" AS ENUM ('telegram_post', 'vk_post', 'facebook_post', 'site_announce', 'blog_post', 'program_card_structured');

-- CreateEnum
CREATE TYPE "ContentDraftStatus" AS ENUM ('draft', 'pending_owner_review', 'ready', 'superseded', 'failed');

-- CreateEnum
CREATE TYPE "ContentOwnerDecision" AS ENUM ('pending', 'approved', 'rewrite_requested', 'rejected', 'deferred');

-- CreateEnum
CREATE TYPE "ContentPublicationChannel" AS ENUM ('telegram_channel', 'vk', 'facebook', 'site_blog', 'site_landing');

-- CreateEnum
CREATE TYPE "ContentPublishState" AS ENUM ('pending', 'scheduled', 'publishing', 'published', 'failed', 'cancelled', 'skipped');

-- AlterTable
ALTER TABLE "normalized_items" ADD COLUMN     "moderationFlagsJson" JSONB,
ADD COLUMN     "normalizedPayloadJson" JSONB,
ADD COLUMN     "relevanceScore" DOUBLE PRECISION;

-- AlterTable
ALTER TABLE "raw_items" ADD COLUMN     "parseStatus" "RawItemParseStatus" NOT NULL DEFAULT 'ok';

-- AlterTable
ALTER TABLE "sources" ADD COLUMN     "adapterKey" TEXT;

-- CreateTable
CREATE TABLE "content_items" (
    "id" TEXT NOT NULL,
    "rawItemId" TEXT NOT NULL,
    "normalizedItemId" TEXT,
    "eventCandidateId" TEXT,
    "programId" TEXT,
    "workflowStatus" "ContentWorkflowStatus" NOT NULL DEFAULT 'ingest_collected',
    "lastError" TEXT,
    "idempotencyKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "content_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "content_drafts" (
    "id" TEXT NOT NULL,
    "contentItemId" TEXT NOT NULL,
    "draftType" "ContentDraftType" NOT NULL,
    "channelTargetsJson" JSONB,
    "generatedHeadline" TEXT,
    "shortCopy" TEXT,
    "longCopy" TEXT,
    "cta" TEXT,
    "ownerNotes" TEXT,
    "voiceTranscript" TEXT,
    "aiModel" TEXT,
    "aiPromptVersion" TEXT,
    "inputPayloadJson" JSONB,
    "rawDraftText" TEXT,
    "finalDraftText" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "status" "ContentDraftStatus" NOT NULL DEFAULT 'draft',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "content_drafts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "content_approvals" (
    "id" TEXT NOT NULL,
    "contentItemId" TEXT NOT NULL,
    "contentDraftId" TEXT,
    "decision" "ContentOwnerDecision" NOT NULL DEFAULT 'pending',
    "comment" TEXT,
    "decidedBy" TEXT,
    "ownerVoiceFileId" TEXT,
    "decidedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "content_approvals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "content_publications" (
    "id" TEXT NOT NULL,
    "contentItemId" TEXT NOT NULL,
    "contentDraftId" TEXT NOT NULL,
    "channel" "ContentPublicationChannel" NOT NULL,
    "state" "ContentPublishState" NOT NULL DEFAULT 'pending',
    "externalPostId" TEXT,
    "externalUrl" TEXT,
    "idempotencyKey" TEXT,
    "publishedAt" TIMESTAMP(3),
    "errorCode" TEXT,
    "errorDetail" TEXT,
    "retryCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "content_publications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "content_metrics" (
    "id" TEXT NOT NULL,
    "contentItemId" TEXT NOT NULL,
    "contentPublicationId" TEXT,
    "sourceId" TEXT,
    "asOfDate" DATE NOT NULL,
    "views" INTEGER NOT NULL DEFAULT 0,
    "clicks" INTEGER NOT NULL DEFAULT 0,
    "leads" INTEGER NOT NULL DEFAULT 0,
    "applications" INTEGER NOT NULL DEFAULT 0,
    "siteSessions" INTEGER NOT NULL DEFAULT 0,
    "bookingCount" INTEGER NOT NULL DEFAULT 0,
    "propertiesJson" JSONB,

    CONSTRAINT "content_metrics_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "content_items_rawItemId_key" ON "content_items"("rawItemId");

-- CreateIndex
CREATE UNIQUE INDEX "content_items_normalizedItemId_key" ON "content_items"("normalizedItemId");

-- CreateIndex
CREATE UNIQUE INDEX "content_items_eventCandidateId_key" ON "content_items"("eventCandidateId");

-- CreateIndex
CREATE UNIQUE INDEX "content_items_idempotencyKey_key" ON "content_items"("idempotencyKey");

-- CreateIndex
CREATE INDEX "content_items_workflowStatus_updatedAt_idx" ON "content_items"("workflowStatus", "updatedAt");

-- CreateIndex
CREATE INDEX "content_drafts_contentItemId_status_idx" ON "content_drafts"("contentItemId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "content_drafts_contentItemId_draftType_version_key" ON "content_drafts"("contentItemId", "draftType", "version");

-- CreateIndex
CREATE INDEX "content_approvals_contentItemId_createdAt_idx" ON "content_approvals"("contentItemId", "createdAt");

-- CreateIndex
CREATE INDEX "content_approvals_contentDraftId_idx" ON "content_approvals"("contentDraftId");

-- CreateIndex
CREATE UNIQUE INDEX "content_publications_idempotencyKey_key" ON "content_publications"("idempotencyKey");

-- CreateIndex
CREATE INDEX "content_publications_channel_state_idx" ON "content_publications"("channel", "state");

-- CreateIndex
CREATE INDEX "content_publications_externalPostId_idx" ON "content_publications"("externalPostId");

-- CreateIndex
CREATE UNIQUE INDEX "content_publications_contentItemId_channel_contentDraftId_key" ON "content_publications"("contentItemId", "channel", "contentDraftId");

-- CreateIndex
CREATE INDEX "content_metrics_contentItemId_asOfDate_idx" ON "content_metrics"("contentItemId", "asOfDate");

-- CreateIndex
CREATE INDEX "content_metrics_sourceId_asOfDate_idx" ON "content_metrics"("sourceId", "asOfDate");

-- AddForeignKey
ALTER TABLE "content_items" ADD CONSTRAINT "content_items_rawItemId_fkey" FOREIGN KEY ("rawItemId") REFERENCES "raw_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "content_items" ADD CONSTRAINT "content_items_normalizedItemId_fkey" FOREIGN KEY ("normalizedItemId") REFERENCES "normalized_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "content_items" ADD CONSTRAINT "content_items_eventCandidateId_fkey" FOREIGN KEY ("eventCandidateId") REFERENCES "event_candidates"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "content_items" ADD CONSTRAINT "content_items_programId_fkey" FOREIGN KEY ("programId") REFERENCES "programs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "content_drafts" ADD CONSTRAINT "content_drafts_contentItemId_fkey" FOREIGN KEY ("contentItemId") REFERENCES "content_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "content_approvals" ADD CONSTRAINT "content_approvals_contentItemId_fkey" FOREIGN KEY ("contentItemId") REFERENCES "content_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "content_approvals" ADD CONSTRAINT "content_approvals_contentDraftId_fkey" FOREIGN KEY ("contentDraftId") REFERENCES "content_drafts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "content_publications" ADD CONSTRAINT "content_publications_contentItemId_fkey" FOREIGN KEY ("contentItemId") REFERENCES "content_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "content_publications" ADD CONSTRAINT "content_publications_contentDraftId_fkey" FOREIGN KEY ("contentDraftId") REFERENCES "content_drafts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "content_metrics" ADD CONSTRAINT "content_metrics_contentItemId_fkey" FOREIGN KEY ("contentItemId") REFERENCES "content_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "content_metrics" ADD CONSTRAINT "content_metrics_contentPublicationId_fkey" FOREIGN KEY ("contentPublicationId") REFERENCES "content_publications"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "content_metrics" ADD CONSTRAINT "content_metrics_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "sources"("id") ON DELETE SET NULL ON UPDATE CASCADE;
