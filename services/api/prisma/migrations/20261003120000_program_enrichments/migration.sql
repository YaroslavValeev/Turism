-- CreateTable
CREATE TABLE "program_enrichments" (
    "id" TEXT NOT NULL,
    "programId" TEXT NOT NULL,
    "field" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "contentJson" JSONB NOT NULL,
    "sourcesJson" JSONB NOT NULL,
    "batchId" TEXT,
    "createdBy" TEXT NOT NULL,
    "reviewedByUserId" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "rejectionReason" TEXT,
    "checkedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "program_enrichments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "program_enrichments_programId_field_status_idx" ON "program_enrichments"("programId", "field", "status");

-- AddForeignKey
ALTER TABLE "program_enrichments" ADD CONSTRAINT "program_enrichments_programId_fkey" FOREIGN KEY ("programId") REFERENCES "programs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "program_enrichments" ADD CONSTRAINT "program_enrichments_field_check" CHECK ("field" IN ('accommodation', 'transfer', 'equipment'));
ALTER TABLE "program_enrichments" ADD CONSTRAINT "program_enrichments_status_check" CHECK ("status" IN ('draft', 'approved', 'rejected', 'retired'));
ALTER TABLE "program_enrichments" ADD CONSTRAINT "program_enrichments_approval_check" CHECK ("status" <> 'approved' OR ("reviewedAt" IS NOT NULL AND "reviewedByUserId" IS NOT NULL));
ALTER TABLE "program_enrichments" ADD CONSTRAINT "program_enrichments_sources_check" CHECK (jsonb_typeof("sourcesJson") = 'array' AND jsonb_array_length("sourcesJson") >= 1);

-- At most one approved enrichment per program field; prior approvals are retired on approve.
CREATE UNIQUE INDEX "program_enrichments_one_approved_per_field_key" ON "program_enrichments"("programId", "field") WHERE "status" = 'approved';
