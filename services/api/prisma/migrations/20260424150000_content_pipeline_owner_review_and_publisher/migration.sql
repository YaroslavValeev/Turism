-- Owner review (E+) + Publisher layer (F)

ALTER TYPE "ContentWorkflowStatus" ADD VALUE 'rewrite_requested';
ALTER TYPE "ContentWorkflowStatus" ADD VALUE 'skipped';
ALTER TYPE "ContentOwnerDecision" ADD VALUE 'skipped';

ALTER TABLE "content_items" ADD COLUMN "ownerReviewAwaitingDraftId" TEXT;
CREATE UNIQUE INDEX "content_items_ownerReviewAwaitingDraftId_key" ON "content_items"("ownerReviewAwaitingDraftId");

ALTER TABLE "content_drafts" ADD COLUMN "telegramPreviewMessageId" INTEGER;
ALTER TABLE "content_drafts" ADD COLUMN "telegramPreviewChatId" TEXT;

ALTER TABLE "content_approvals" ADD COLUMN "source" TEXT DEFAULT 'telegram';
UPDATE "content_approvals" SET "source" = 'telegram' WHERE "source" IS NULL;

ALTER TABLE "content_items"
  ADD CONSTRAINT "content_items_ownerReviewAwaitingDraftId_fkey"
  FOREIGN KEY ("ownerReviewAwaitingDraftId") REFERENCES "content_drafts"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "processed_telegram_callbacks" (
  "id" TEXT NOT NULL,
  "contentDraftId" TEXT,
  "contentItemId" TEXT,
  "action" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "processed_telegram_callbacks_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "processed_telegram_callbacks_createdAt_idx" ON "processed_telegram_callbacks"("createdAt");

DROP INDEX "content_publications_contentItemId_channel_contentDraftId_key";
CREATE UNIQUE INDEX "content_publications_contentDraftId_channel_key" ON "content_publications"("contentDraftId","channel");

ALTER TABLE "content_metrics" ADD COLUMN "channel" "ContentPublicationChannel";
ALTER TABLE "content_metrics" ADD COLUMN "publishedAt" TIMESTAMP(3);
ALTER TABLE "content_metrics" ADD COLUMN "utmSource" TEXT;
ALTER TABLE "content_metrics" ADD COLUMN "utmCampaign" TEXT;
CREATE INDEX "content_metrics_channel_publishedAt_idx" ON "content_metrics"("channel","publishedAt");

