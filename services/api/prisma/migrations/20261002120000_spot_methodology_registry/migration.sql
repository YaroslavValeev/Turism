-- CreateTable
CREATE TABLE "spot_methodologies" (
    "id" TEXT NOT NULL,
    "discipline" TEXT NOT NULL,
    "methodologyVersion" TEXT NOT NULL,
    "protocolVersion" TEXT NOT NULL,
    "criteriaVersion" TEXT NOT NULL,
    "ratingVersion" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "definition" JSONB NOT NULL,
    "definitionSha256" TEXT NOT NULL,
    "approvedByUserId" TEXT,
    "approvedAt" TIMESTAMP(3),
    "retiredAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "spot_methodologies_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "spot_methodologies_discipline_status_idx" ON "spot_methodologies"("discipline", "status");

-- CreateIndex
CREATE UNIQUE INDEX "spot_methodologies_discipline_methodologyVersion_protocolVe_key" ON "spot_methodologies"("discipline", "methodologyVersion", "protocolVersion", "criteriaVersion", "ratingVersion");

ALTER TABLE "spot_methodologies" ADD CONSTRAINT "spot_methodologies_status_check" CHECK ("status" IN ('draft', 'approved', 'retired'));
-- Applies to 'approved' only: draft -> retired is allowed for never-approved methodologies,
-- and approved -> retired keeps the approval fields because the trigger freezes them.
ALTER TABLE "spot_methodologies" ADD CONSTRAINT "spot_methodologies_approval_check" CHECK ("status" <> 'approved' OR ("approvedAt" IS NOT NULL AND "approvedByUserId" IS NOT NULL));
ALTER TABLE "spot_methodologies" ADD CONSTRAINT "spot_methodologies_definition_sha256_check" CHECK ("definitionSha256" ~ '^[0-9a-f]{64}$');

-- Approved/retired methodologies are immutable: a changed definition must be a new version (new row).
CREATE OR REPLACE FUNCTION spot_methodologies_guard() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD."status" <> 'draft' THEN
      RAISE EXCEPTION 'spot_methodologies: % methodology % cannot be deleted', OLD."status", OLD."id";
    END IF;
    RETURN OLD;
  END IF;

  IF NEW."status" IS DISTINCT FROM OLD."status" AND NOT (
    (OLD."status" = 'draft' AND NEW."status" IN ('approved', 'retired'))
    OR (OLD."status" = 'approved' AND NEW."status" = 'retired')) THEN
    RAISE EXCEPTION 'spot_methodologies: status transition % -> % is not allowed for %', OLD."status", NEW."status", OLD."id";
  END IF;

  IF OLD."status" <> 'draft' AND (
    NEW."id" IS DISTINCT FROM OLD."id"
    OR NEW."discipline" IS DISTINCT FROM OLD."discipline"
    OR NEW."methodologyVersion" IS DISTINCT FROM OLD."methodologyVersion"
    OR NEW."protocolVersion" IS DISTINCT FROM OLD."protocolVersion"
    OR NEW."criteriaVersion" IS DISTINCT FROM OLD."criteriaVersion"
    OR NEW."ratingVersion" IS DISTINCT FROM OLD."ratingVersion"
    OR NEW."definition" IS DISTINCT FROM OLD."definition"
    OR NEW."definitionSha256" IS DISTINCT FROM OLD."definitionSha256"
    OR NEW."approvedAt" IS DISTINCT FROM OLD."approvedAt"
    OR NEW."approvedByUserId" IS DISTINCT FROM OLD."approvedByUserId") THEN
    RAISE EXCEPTION 'spot_methodologies: definition, versions and approval of % methodology % are immutable', OLD."status", OLD."id";
  END IF;

  IF OLD."status" = 'retired' AND NEW."retiredAt" IS DISTINCT FROM OLD."retiredAt" THEN
    RAISE EXCEPTION 'spot_methodologies: retirement of methodology % cannot be changed', OLD."id";
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER spot_methodologies_guard_trg
  BEFORE UPDATE OR DELETE ON "spot_methodologies"
  FOR EACH ROW EXECUTE FUNCTION spot_methodologies_guard();
