-- Preserve ingestion lineage from SourceRun to RawItem for newly collected items.
-- Nullable by design: historical rows can be audited/backfilled separately without blocking deploy.
ALTER TABLE "raw_items" ADD COLUMN "sourceRunId" TEXT;

CREATE INDEX "raw_items_sourceRunId_idx" ON "raw_items"("sourceRunId");

ALTER TABLE "raw_items"
  ADD CONSTRAINT "raw_items_sourceRunId_fkey"
  FOREIGN KEY ("sourceRunId")
  REFERENCES "source_runs"("id")
  ON DELETE SET NULL
  ON UPDATE CASCADE;
