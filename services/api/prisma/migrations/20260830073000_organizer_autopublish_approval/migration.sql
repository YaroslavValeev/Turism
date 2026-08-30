ALTER TABLE "organizers"
  ADD COLUMN "autoPublishApprovedAt" TIMESTAMP(3),
  ADD COLUMN "autoPublishApprovedBy" TEXT;
