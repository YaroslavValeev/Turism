-- D3 (docs/product/SPOT_MAP_DATA_LAYER_PLAN.md, 7.4): every assessment and snapshot is pinned to a
-- registry methodology version plus the definitionSha256 it was created against. Additive only:
-- columns are nullable so rows created before D3 stay valid; new rows are forced by triggers.

-- AlterTable
ALTER TABLE "spot_audits" ADD COLUMN "methodologyId" TEXT,
ADD COLUMN "methodologySha256" TEXT;

-- AlterTable
ALTER TABLE "spot_rating_snapshots" ADD COLUMN "methodologyId" TEXT,
ADD COLUMN "methodologySha256" TEXT;

-- CreateIndex
CREATE INDEX "spot_audits_methodologyId_idx" ON "spot_audits"("methodologyId");

-- CreateIndex
CREATE INDEX "spot_rating_snapshots_methodologyId_idx" ON "spot_rating_snapshots"("methodologyId");

-- AddForeignKey
ALTER TABLE "spot_audits" ADD CONSTRAINT "spot_audits_methodologyId_fkey" FOREIGN KEY ("methodologyId") REFERENCES "spot_methodologies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "spot_rating_snapshots" ADD CONSTRAINT "spot_rating_snapshots_methodologyId_fkey" FOREIGN KEY ("methodologyId") REFERENCES "spot_methodologies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "spot_audits" ADD CONSTRAINT "spot_audits_methodology_pin_check" CHECK (
  ("methodologyId" IS NULL AND "methodologySha256" IS NULL)
  OR ("methodologyId" IS NOT NULL AND "methodologySha256" ~ '^[0-9a-f]{64}$'));
ALTER TABLE "spot_rating_snapshots" ADD CONSTRAINT "spot_rating_snapshots_methodology_pin_check" CHECK (
  ("methodologyId" IS NULL AND "methodologySha256" IS NULL)
  OR ("methodologyId" IS NOT NULL AND "methodologySha256" ~ '^[0-9a-f]{64}$'));

-- Backfill: a pre-D3 assessment is pinned only when exactly one registry row has the same discipline
-- and the same three versions. Anything else stays NULL (legacy, no new snapshots) — no guessing.
-- Snapshots are not backfilled: they were computed with the approval flag from the request body.
UPDATE "spot_audits" AS a
SET "methodologyId" = m."id", "methodologySha256" = m."definitionSha256"
FROM "spot_service_units" AS u, "spot_methodologies" AS m
WHERE a."unitId" = u."id"
  AND a."methodologyId" IS NULL
  AND m."discipline" = u."discipline"
  AND m."methodologyVersion" = a."methodologyVersion"
  AND m."protocolVersion" = a."protocolVersion"
  AND m."criteriaVersion" = a."criteriaVersion"
  AND (
    SELECT count(*) FROM "spot_methodologies" AS m2
    WHERE m2."discipline" = u."discipline"
      AND m2."methodologyVersion" = a."methodologyVersion"
      AND m2."protocolVersion" = a."protocolVersion"
      AND m2."criteriaVersion" = a."criteriaVersion") = 1;

-- New assessments must be pinned to a non-retired methodology with its current sha256 and versions;
-- once pinned, the methodology, sha256 and versions of an assessment never change.
CREATE OR REPLACE FUNCTION spot_audits_methodology_pin_guard() RETURNS trigger AS $$
DECLARE
  m RECORD;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF OLD."methodologyId" IS NOT NULL THEN
      IF NEW."methodologyId" IS DISTINCT FROM OLD."methodologyId"
        OR NEW."methodologySha256" IS DISTINCT FROM OLD."methodologySha256"
        OR NEW."methodologyVersion" IS DISTINCT FROM OLD."methodologyVersion"
        OR NEW."protocolVersion" IS DISTINCT FROM OLD."protocolVersion"
        OR NEW."criteriaVersion" IS DISTINCT FROM OLD."criteriaVersion" THEN
        RAISE EXCEPTION 'spot_audits: methodology pin of assessment % is immutable', OLD."id";
      END IF;
      RETURN NEW;
    END IF;
    IF NEW."methodologyId" IS NULL THEN
      RETURN NEW;
    END IF;
  END IF;

  IF NEW."methodologyId" IS NULL THEN
    RAISE EXCEPTION 'spot_audits: assessment % must be pinned to a methodology', NEW."id";
  END IF;

  SELECT "status", "definitionSha256", "methodologyVersion", "protocolVersion", "criteriaVersion"
  INTO m FROM "spot_methodologies" WHERE "id" = NEW."methodologyId";
  IF NOT FOUND THEN
    RAISE EXCEPTION 'spot_audits: methodology % does not exist', NEW."methodologyId";
  END IF;
  IF m."status" = 'retired' THEN
    RAISE EXCEPTION 'spot_audits: methodology % is retired', NEW."methodologyId";
  END IF;
  IF NEW."methodologySha256" IS DISTINCT FROM m."definitionSha256"
    OR NEW."methodologyVersion" IS DISTINCT FROM m."methodologyVersion"
    OR NEW."protocolVersion" IS DISTINCT FROM m."protocolVersion"
    OR NEW."criteriaVersion" IS DISTINCT FROM m."criteriaVersion" THEN
    RAISE EXCEPTION 'spot_audits: assessment % does not match methodology %', NEW."id", NEW."methodologyId";
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER spot_audits_methodology_pin_guard_trg
  BEFORE INSERT OR UPDATE ON "spot_audits"
  FOR EACH ROW EXECUTE FUNCTION spot_audits_methodology_pin_guard();

-- New snapshots carry the pin of their assessment, and the methodology must still have that sha256.
CREATE OR REPLACE FUNCTION spot_rating_snapshots_methodology_pin_guard() RETURNS trigger AS $$
DECLARE
  audit_methodology_id TEXT;
  audit_methodology_sha TEXT;
  current_sha TEXT;
BEGIN
  SELECT "methodologyId", "methodologySha256" INTO audit_methodology_id, audit_methodology_sha
  FROM "spot_audits" WHERE "id" = NEW."auditId";
  IF NEW."methodologyId" IS NULL
    OR NEW."methodologyId" IS DISTINCT FROM audit_methodology_id
    OR NEW."methodologySha256" IS DISTINCT FROM audit_methodology_sha THEN
    RAISE EXCEPTION 'spot_rating_snapshots: snapshot must carry the methodology pin of assessment %', NEW."auditId";
  END IF;
  SELECT "definitionSha256" INTO current_sha FROM "spot_methodologies" WHERE "id" = NEW."methodologyId";
  IF current_sha IS DISTINCT FROM NEW."methodologySha256" THEN
    RAISE EXCEPTION 'spot_rating_snapshots: methodology % changed after assessment %', NEW."methodologyId", NEW."auditId";
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER spot_rating_snapshots_methodology_pin_guard_trg
  BEFORE INSERT ON "spot_rating_snapshots"
  FOR EACH ROW EXECUTE FUNCTION spot_rating_snapshots_methodology_pin_guard();

-- Same guard as 20260929150000_spot_map_data_layer, plus the methodology pin among computed fields.
CREATE OR REPLACE FUNCTION spot_rating_snapshots_guard() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD."publishedAt" IS NOT NULL THEN
      RAISE EXCEPTION 'spot_rating_snapshots: published snapshot % cannot be deleted', OLD."id";
    END IF;
    RETURN OLD;
  END IF;

  IF NEW."id" IS DISTINCT FROM OLD."id"
    OR NEW."unitId" IS DISTINCT FROM OLD."unitId"
    OR NEW."auditId" IS DISTINCT FROM OLD."auditId"
    OR NEW."methodologyId" IS DISTINCT FROM OLD."methodologyId"
    OR NEW."methodologySha256" IS DISTINCT FROM OLD."methodologySha256"
    OR NEW."methodologyVersion" IS DISTINCT FROM OLD."methodologyVersion"
    OR NEW."protocolVersion" IS DISTINCT FROM OLD."protocolVersion"
    OR NEW."criteriaVersion" IS DISTINCT FROM OLD."criteriaVersion"
    OR NEW."ratingVersion" IS DISTINCT FROM OLD."ratingVersion"
    OR NEW."officialScore" IS DISTINCT FROM OLD."officialScore"
    OR NEW."band" IS DISTINCT FROM OLD."band"
    OR NEW."publishable" IS DISTINCT FROM OLD."publishable"
    OR NEW."blockers" IS DISTINCT FROM OLD."blockers"
    OR NEW."inputJson" IS DISTINCT FROM OLD."inputJson"
    OR NEW."expiresAt" IS DISTINCT FROM OLD."expiresAt"
    OR NEW."computedAt" IS DISTINCT FROM OLD."computedAt"
    OR NEW."computedByUserId" IS DISTINCT FROM OLD."computedByUserId" THEN
    RAISE EXCEPTION 'spot_rating_snapshots: computed fields of snapshot % are immutable', OLD."id";
  END IF;

  IF OLD."publishedAt" IS NOT NULL AND (
    NEW."publishedAt" IS DISTINCT FROM OLD."publishedAt"
    OR NEW."publishedByUserId" IS DISTINCT FROM OLD."publishedByUserId") THEN
    RAISE EXCEPTION 'spot_rating_snapshots: publication of snapshot % cannot be changed', OLD."id";
  END IF;

  IF OLD."revokedAt" IS NOT NULL AND (
    NEW."revokedAt" IS DISTINCT FROM OLD."revokedAt"
    OR NEW."revokeReason" IS DISTINCT FROM OLD."revokeReason") THEN
    RAISE EXCEPTION 'spot_rating_snapshots: revocation of snapshot % cannot be changed', OLD."id";
  END IF;

  IF OLD."revokedAt" IS NOT NULL AND OLD."publishedAt" IS NULL AND NEW."publishedAt" IS NOT NULL THEN
    RAISE EXCEPTION 'spot_rating_snapshots: revoked snapshot % cannot be published', OLD."id";
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
