-- CreateTable
CREATE TABLE "program_ugc_media_assets" (
    "id" TEXT NOT NULL,
    "programUgcId" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "byteSize" INTEGER NOT NULL DEFAULT 0,
    "moderationStatus" TEXT NOT NULL DEFAULT 'pending',
    "moderationNotes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "program_ugc_media_assets_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "program_ugc_media_assets_programUgcId_idx" ON "program_ugc_media_assets"("programUgcId");

-- CreateIndex
CREATE INDEX "program_ugc_media_assets_moderationStatus_createdAt_idx" ON "program_ugc_media_assets"("moderationStatus", "createdAt");

-- AddForeignKey
ALTER TABLE "program_ugc_media_assets" ADD CONSTRAINT "program_ugc_media_assets_programUgcId_fkey" FOREIGN KEY ("programUgcId") REFERENCES "program_ugc"("id") ON DELETE CASCADE ON UPDATE CASCADE;
