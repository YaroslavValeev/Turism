-- Очередь оператора: статус обработки заявки организатора и связь с созданной программой.
ALTER TABLE "public_organizer_intakes" ADD COLUMN "processingStatus" TEXT NOT NULL DEFAULT 'new';
ALTER TABLE "public_organizer_intakes" ADD COLUMN "linkedProgramId" TEXT;
ALTER TABLE "public_organizer_intakes" ADD COLUMN "processedAt" TIMESTAMP(3);
ALTER TABLE "public_organizer_intakes" ADD COLUMN "processedBy" TEXT;

CREATE INDEX "public_organizer_intakes_processingStatus_createdAt_idx" ON "public_organizer_intakes"("processingStatus", "createdAt");
