-- Owner decision 2026-10-02: pilot assessments on a draft methodology are allowed, but once any
-- spot_audits row is pinned to a draft, its definition, sha256, versions and discipline are locked.
-- A changed definition must become a new version (new row). Function bodies only; no data changes.

-- Same guard as 20261002120000_spot_methodology_registry, plus the lock on drafts with pinned assessments.
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

  IF OLD."status" = 'draft' AND (
    NEW."id" IS DISTINCT FROM OLD."id"
    OR NEW."discipline" IS DISTINCT FROM OLD."discipline"
    OR NEW."methodologyVersion" IS DISTINCT FROM OLD."methodologyVersion"
    OR NEW."protocolVersion" IS DISTINCT FROM OLD."protocolVersion"
    OR NEW."criteriaVersion" IS DISTINCT FROM OLD."criteriaVersion"
    OR NEW."ratingVersion" IS DISTINCT FROM OLD."ratingVersion"
    OR NEW."definition" IS DISTINCT FROM OLD."definition"
    OR NEW."definitionSha256" IS DISTINCT FROM OLD."definitionSha256")
    AND EXISTS (SELECT 1 FROM "spot_audits" WHERE "methodologyId" = OLD."id") THEN
    RAISE EXCEPTION 'spot_methodologies: draft methodology % has pinned assessments; its definition and versions are locked', OLD."id";
  END IF;

  IF OLD."status" = 'retired' AND NEW."retiredAt" IS DISTINCT FROM OLD."retiredAt" THEN
    RAISE EXCEPTION 'spot_methodologies: retirement of methodology % cannot be changed', OLD."id";
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Same guard as 20261004120000_spot_assessment_methodology_pin, but the methodology row is read
-- FOR SHARE: a concurrent draft update and a new pinned assessment serialize on that row, so the
-- lock above cannot be bypassed by a race (one of the two transactions fails).
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
  INTO m FROM "spot_methodologies" WHERE "id" = NEW."methodologyId" FOR SHARE;
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
