-- AlterTable
ALTER TABLE "programs" ADD COLUMN     "autoPublished" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "ingestedAt" TIMESTAMP(3),
ADD COLUMN     "reviewStatus" TEXT NOT NULL DEFAULT 'ok',
ADD COLUMN     "sourceId" TEXT,
ADD COLUMN     "sourceType" TEXT,
ADD COLUMN     "sourceUrl" TEXT,
ADD COLUMN     "updatedFromSourceAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "programs_sourceId_idx" ON "programs"("sourceId");

-- AddForeignKey
ALTER TABLE "programs" ADD CONSTRAINT "programs_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "sources"("id") ON DELETE SET NULL ON UPDATE CASCADE;
