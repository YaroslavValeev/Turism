-- AlterTable
ALTER TABLE "blog_posts" ADD COLUMN     "relatedCollectionIds" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- AlterTable
ALTER TABLE "bookings" ADD COLUMN     "contentItemId" TEXT,
ADD COLUMN     "entryId" TEXT,
ADD COLUMN     "entryType" TEXT,
ADD COLUMN     "exploreSlug" TEXT,
ADD COLUMN     "exploreType" TEXT,
ADD COLUMN     "utmMedium" TEXT,
ADD COLUMN     "utmSource" TEXT;

-- AlterTable
ALTER TABLE "content_metrics" ADD COLUMN     "revenueRub" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "deals" (
    "id" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "contentItemId" TEXT,
    "dealStatus" TEXT NOT NULL DEFAULT 'new',
    "dealAmountRub" INTEGER NOT NULL DEFAULT 0,
    "commissionRatePct" INTEGER NOT NULL DEFAULT 3,
    "commissionAmountRub" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "deals_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "deals_bookingId_key" ON "deals"("bookingId");

-- CreateIndex
CREATE INDEX "deals_contentItemId_idx" ON "deals"("contentItemId");

-- CreateIndex
CREATE INDEX "deals_dealStatus_idx" ON "deals"("dealStatus");

-- CreateIndex
CREATE INDEX "bookings_contentItemId_idx" ON "bookings"("contentItemId");

-- AddForeignKey
ALTER TABLE "deals" ADD CONSTRAINT "deals_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "bookings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deals" ADD CONSTRAINT "deals_contentItemId_fkey" FOREIGN KEY ("contentItemId") REFERENCES "content_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_contentItemId_fkey" FOREIGN KEY ("contentItemId") REFERENCES "content_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;
