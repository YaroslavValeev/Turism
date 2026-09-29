-- CreateTable
CREATE TABLE "spots" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "region" TEXT NOT NULL,
    "address" TEXT,
    "latitude" DECIMAL(9,6),
    "longitude" DECIMAL(9,6),
    "waterBodyType" TEXT,
    "organizerId" TEXT,
    "relatedToMyWave" BOOLEAN NOT NULL DEFAULT false,
    "discoveryStatus" TEXT NOT NULL DEFAULT 'candidate',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "spots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "spot_service_units" (
    "id" TEXT NOT NULL,
    "spotId" TEXT NOT NULL,
    "discipline" TEXT NOT NULL DEFAULT 'wakesurf',
    "serviceName" TEXT NOT NULL,
    "equipmentConfig" JSONB NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "spot_service_units_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "spot_audits" (
    "id" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "testedAt" TIMESTAMP(3) NOT NULL,
    "methodologyVersion" TEXT NOT NULL,
    "protocolVersion" TEXT NOT NULL,
    "criteriaVersion" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "expertUserId" TEXT,
    "expertSignedAt" TIMESTAMP(3),
    "externalExpertConfirmed" BOOLEAN NOT NULL DEFAULT false,
    "externalExpertName" TEXT,
    "independentEditorUserId" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "spot_audits_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "spot_audit_category_scores" (
    "id" TEXT NOT NULL,
    "auditId" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "score" DECIMAL(3,1) NOT NULL,

    CONSTRAINT "spot_audit_category_scores_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "spot_audit_gate_results" (
    "id" TEXT NOT NULL,
    "auditId" TEXT NOT NULL,
    "gateId" TEXT NOT NULL,
    "status" TEXT NOT NULL,

    CONSTRAINT "spot_audit_gate_results_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "spot_evidence" (
    "id" TEXT NOT NULL,
    "auditId" TEXT NOT NULL,
    "criterion" TEXT,
    "kind" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "sha256" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "capturedAt" TIMESTAMP(3),
    "isGenerated" BOOLEAN NOT NULL DEFAULT false,
    "uploadedByUserId" TEXT,
    "integrityConfirmedByUserId" TEXT,
    "integrityConfirmedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "spot_evidence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "spot_gate_remediations" (
    "id" TEXT NOT NULL,
    "auditId" TEXT NOT NULL,
    "gateId" TEXT NOT NULL DEFAULT 'G05',
    "evidenceId" TEXT NOT NULL,
    "moderatorUserId" TEXT NOT NULL,
    "rationale" TEXT NOT NULL,
    "verifiedWorkingHotWater" BOOLEAN NOT NULL,
    "accepted" BOOLEAN NOT NULL,
    "reasons" JSONB NOT NULL,
    "decidedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "spot_gate_remediations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "spot_rating_snapshots" (
    "id" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "auditId" TEXT NOT NULL,
    "methodologyVersion" TEXT NOT NULL,
    "protocolVersion" TEXT NOT NULL,
    "criteriaVersion" TEXT NOT NULL,
    "ratingVersion" TEXT NOT NULL,
    "officialScore" DECIMAL(3,1),
    "band" TEXT,
    "publishable" BOOLEAN NOT NULL,
    "blockers" JSONB NOT NULL,
    "inputJson" JSONB NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "computedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "computedByUserId" TEXT,
    "publishedAt" TIMESTAMP(3),
    "publishedByUserId" TEXT,
    "revokedAt" TIMESTAMP(3),
    "revokeReason" TEXT,

    CONSTRAINT "spot_rating_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "spot_appeals" (
    "id" TEXT NOT NULL,
    "snapshotId" TEXT NOT NULL,
    "submittedBy" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'open',
    "resolution" TEXT,
    "resolvedByUserId" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "spot_appeals_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "spots_region_idx" ON "spots"("region");

-- CreateIndex
CREATE INDEX "spots_discoveryStatus_idx" ON "spots"("discoveryStatus");

-- CreateIndex
CREATE INDEX "spots_organizerId_idx" ON "spots"("organizerId");

-- CreateIndex
CREATE INDEX "spot_service_units_spotId_idx" ON "spot_service_units"("spotId");

-- CreateIndex
CREATE INDEX "spot_service_units_discipline_idx" ON "spot_service_units"("discipline");

-- CreateIndex
CREATE INDEX "spot_audits_unitId_idx" ON "spot_audits"("unitId");

-- CreateIndex
CREATE INDEX "spot_audits_status_idx" ON "spot_audits"("status");

-- CreateIndex
CREATE UNIQUE INDEX "spot_audit_category_scores_auditId_category_key" ON "spot_audit_category_scores"("auditId", "category");

-- CreateIndex
CREATE UNIQUE INDEX "spot_audit_gate_results_auditId_gateId_key" ON "spot_audit_gate_results"("auditId", "gateId");

-- CreateIndex
CREATE UNIQUE INDEX "spot_evidence_storageKey_key" ON "spot_evidence"("storageKey");

-- CreateIndex
CREATE INDEX "spot_evidence_auditId_idx" ON "spot_evidence"("auditId");

-- CreateIndex
CREATE INDEX "spot_gate_remediations_auditId_idx" ON "spot_gate_remediations"("auditId");

-- CreateIndex
CREATE INDEX "spot_rating_snapshots_unitId_publishedAt_idx" ON "spot_rating_snapshots"("unitId", "publishedAt");

-- CreateIndex
CREATE INDEX "spot_rating_snapshots_auditId_idx" ON "spot_rating_snapshots"("auditId");

-- CreateIndex
CREATE INDEX "spot_appeals_snapshotId_idx" ON "spot_appeals"("snapshotId");

-- CreateIndex
CREATE INDEX "spot_appeals_status_idx" ON "spot_appeals"("status");

-- AddForeignKey
ALTER TABLE "spots" ADD CONSTRAINT "spots_organizerId_fkey" FOREIGN KEY ("organizerId") REFERENCES "organizers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "spot_service_units" ADD CONSTRAINT "spot_service_units_spotId_fkey" FOREIGN KEY ("spotId") REFERENCES "spots"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "spot_audits" ADD CONSTRAINT "spot_audits_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "spot_service_units"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "spot_audits" ADD CONSTRAINT "spot_audits_expertUserId_fkey" FOREIGN KEY ("expertUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "spot_audits" ADD CONSTRAINT "spot_audits_independentEditorUserId_fkey" FOREIGN KEY ("independentEditorUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "spot_audit_category_scores" ADD CONSTRAINT "spot_audit_category_scores_auditId_fkey" FOREIGN KEY ("auditId") REFERENCES "spot_audits"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "spot_audit_gate_results" ADD CONSTRAINT "spot_audit_gate_results_auditId_fkey" FOREIGN KEY ("auditId") REFERENCES "spot_audits"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "spot_evidence" ADD CONSTRAINT "spot_evidence_auditId_fkey" FOREIGN KEY ("auditId") REFERENCES "spot_audits"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "spot_gate_remediations" ADD CONSTRAINT "spot_gate_remediations_auditId_fkey" FOREIGN KEY ("auditId") REFERENCES "spot_audits"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "spot_gate_remediations" ADD CONSTRAINT "spot_gate_remediations_evidenceId_fkey" FOREIGN KEY ("evidenceId") REFERENCES "spot_evidence"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "spot_rating_snapshots" ADD CONSTRAINT "spot_rating_snapshots_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "spot_service_units"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "spot_rating_snapshots" ADD CONSTRAINT "spot_rating_snapshots_auditId_fkey" FOREIGN KEY ("auditId") REFERENCES "spot_audits"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "spot_appeals" ADD CONSTRAINT "spot_appeals_snapshotId_fkey" FOREIGN KEY ("snapshotId") REFERENCES "spot_rating_snapshots"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Methodology v1.1: only G05 (hot water / shower) may be remediated remotely.
ALTER TABLE "spot_gate_remediations" ADD CONSTRAINT "spot_gate_remediations_gate_g05_check" CHECK ("gateId" = 'G05');

ALTER TABLE "spot_audits" ADD CONSTRAINT "spot_audits_status_check" CHECK ("status" IN ('draft', 'submitted', 'signed', 'void'));
ALTER TABLE "spot_audit_gate_results" ADD CONSTRAINT "spot_audit_gate_results_status_check" CHECK ("status" IN ('pass', 'fail', 'unknown'));
ALTER TABLE "spot_audit_category_scores" ADD CONSTRAINT "spot_audit_category_scores_score_check" CHECK ("score" >= 0 AND "score" <= 10);
ALTER TABLE "spot_rating_snapshots" ADD CONSTRAINT "spot_rating_snapshots_publishable_check" CHECK ("publishedAt" IS NULL OR "publishable" = true);

-- Snapshots are immutable: only publication (once) and revocation (once) may be recorded.
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

CREATE TRIGGER spot_rating_snapshots_guard_trg
  BEFORE UPDATE OR DELETE ON "spot_rating_snapshots"
  FOR EACH ROW EXECUTE FUNCTION spot_rating_snapshots_guard();

