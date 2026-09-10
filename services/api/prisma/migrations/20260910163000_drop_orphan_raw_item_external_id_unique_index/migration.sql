-- The previous external-revisions migration removed the named constraint, but
-- some production databases retained a standalone unique index with the old
-- name. That index still prevents revisions sharing an external item id.
DROP INDEX IF EXISTS "raw_items_sourceId_externalItemId_key";

CREATE INDEX IF NOT EXISTS "raw_items_sourceId_externalItemId_idx"
  ON "raw_items"("sourceId", "externalItemId");
