-- Allow one source item URL/post id to produce multiple raw-item revisions when
-- the upstream content changes. Idempotency remains enforced by content hash.
ALTER TABLE "raw_items" DROP CONSTRAINT IF EXISTS "raw_items_sourceId_externalItemId_key";

CREATE INDEX IF NOT EXISTS "raw_items_sourceId_externalItemId_idx"
  ON "raw_items"("sourceId", "externalItemId");
