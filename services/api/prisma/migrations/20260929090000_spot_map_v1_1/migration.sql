-- MyWave Spot Map v1.1 native persistence.
-- No synthetic ratings are seeded by this migration.

CREATE TABLE "spots" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "slug" TEXT NOT NULL,
  "country" TEXT NOT NULL DEFAULT 'Россия',
  "region" TEXT NOT NULL,
  "city" TEXT,
  "address" TEXT,
  "latitude" DOUBLE PRECISION,
  "longitude" DOUBLE PRECISION,
  "sourceUrl" TEXT,
  "cardStatus" TEXT NOT NULL DEFAULT 'draft',
  "factsStatus" TEXT NOT NULL DEFAULT 'unverified',
  "relatedToMyWave" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "spots_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "spot_offerings" (
  "id" TEXT NOT NULL,
  "spotId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "discipline" TEXT NOT NULL DEFAULT 'wakesurf',
  "equipmentLabel" TEXT,
  "equipmentIdentity" TEXT,
  "priceAmountRub" INTEGER,
  "priceDurationMinutes" INTEGER,
  "priceIncludes" TEXT,
  "status" TEXT NOT NULL DEFAULT 'active',
  "currentRatingSnapshotId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "spot_offerings_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "spot_experts" (
  "id" TEXT NOT NULL,
  "displayName" TEXT NOT NULL,
  "discipline" TEXT NOT NULL,
  "qualification" TEXT,
  "independent" BOOLEAN NOT NULL DEFAULT true,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "spot_experts_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "spot_audits" (
  "id" TEXT NOT NULL,
  "offeringId" TEXT NOT NULL,
  "expertId" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'draft',
  "methodologyVersion" TEXT NOT NULL,
  "protocolVersion" TEXT NOT NULL,
  "criteriaVersion" TEXT NOT NULL,
  "ratingVersion" TEXT NOT NULL,
  "startedAt" TIMESTAMP(3),
  "testedAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "professionalTestCompleted" BOOLEAN NOT NULL DEFAULT false,
  "methodologyApprovedForPublication" BOOLEAN NOT NULL DEFAULT false,
  "expertSigned" BOOLEAN NOT NULL DEFAULT false,
  "criterionEvidenceComplete" BOOLEAN NOT NULL DEFAULT false,
  "evidenceIntegrityConfirmed" BOOLEAN NOT NULL DEFAULT false,
  "categoryScores" JSONB,
  "externalExpertConfirmed" BOOLEAN NOT NULL DEFAULT false,
  "independentEditorConfirmed" BOOLEAN NOT NULL DEFAULT false,
  "signedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "spot_audits_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "spot_evidence" (
  "id" TEXT NOT NULL,
  "auditId" TEXT NOT NULL,
  "criterionKey" TEXT,
  "gateId" TEXT,
  "sessionKey" TEXT,
  "storagePath" TEXT NOT NULL,
  "sha256" TEXT NOT NULL,
  "source" TEXT NOT NULL,
  "mediaType" TEXT NOT NULL,
  "uploadedBy" TEXT,
  "rightsStatus" TEXT NOT NULL,
  "publicAllowed" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "spot_evidence_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "spot_gate_results" (
  "id" TEXT NOT NULL,
  "auditId" TEXT NOT NULL,
  "gateId" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "rationale" TEXT,
  "decidedBy" TEXT,
  "decidedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "spot_gate_results_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "spot_rating_snapshots" (
  "id" TEXT NOT NULL,
  "offeringId" TEXT NOT NULL,
  "auditId" TEXT NOT NULL,
  "methodologyVersion" TEXT NOT NULL,
  "protocolVersion" TEXT NOT NULL,
  "criteriaVersion" TEXT NOT NULL,
  "ratingVersion" TEXT NOT NULL,
  "officialScore" DECIMAL(3,1) NOT NULL,
  "band" TEXT NOT NULL,
  "categoryScores" JSONB NOT NULL,
  "gateStatuses" JSONB NOT NULL,
  "expertId" TEXT NOT NULL,
  "expertDisplayName" TEXT NOT NULL,
  "testedAt" TIMESTAMP(3) NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "publishedAt" TIMESTAMP(3) NOT NULL,
  "publishedBy" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "spot_rating_snapshots_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "spot_remediations" (
  "id" TEXT NOT NULL,
  "auditId" TEXT NOT NULL,
  "gateId" TEXT NOT NULL DEFAULT 'G05',
  "evidenceId" TEXT,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "moderatorId" TEXT,
  "rationale" TEXT,
  "verifiedWorkingHotWater" BOOLEAN NOT NULL DEFAULT false,
  "decidedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "spot_remediations_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "spot_appeals" (
  "id" TEXT NOT NULL,
  "offeringId" TEXT NOT NULL,
  "snapshotId" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'registered',
  "reason" TEXT NOT NULL,
  "openedBy" TEXT,
  "openedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "secondExpertAuditId" TEXT,
  "thirdExpertAuditId" TEXT,
  "decision" TEXT,
  "resolvedBy" TEXT,
  "resolvedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "spot_appeals_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "spots_slug_key" ON "spots"("slug");
CREATE INDEX "spots_cardStatus_region_idx" ON "spots"("cardStatus", "region");
CREATE INDEX "spots_country_region_idx" ON "spots"("country", "region");

CREATE UNIQUE INDEX "spot_offerings_currentRatingSnapshotId_key" ON "spot_offerings"("currentRatingSnapshotId");
CREATE INDEX "spot_offerings_discipline_status_idx" ON "spot_offerings"("discipline", "status");
CREATE INDEX "spot_offerings_spotId_discipline_idx" ON "spot_offerings"("spotId", "discipline");

CREATE INDEX "spot_experts_discipline_active_idx" ON "spot_experts"("discipline", "active");
CREATE INDEX "spot_audits_offeringId_createdAt_idx" ON "spot_audits"("offeringId", "createdAt");
CREATE INDEX "spot_audits_expertId_status_idx" ON "spot_audits"("expertId", "status");
CREATE INDEX "spot_evidence_auditId_criterionKey_idx" ON "spot_evidence"("auditId", "criterionKey");
CREATE INDEX "spot_evidence_auditId_gateId_idx" ON "spot_evidence"("auditId", "gateId");
CREATE UNIQUE INDEX "spot_gate_results_auditId_gateId_key" ON "spot_gate_results"("auditId", "gateId");
CREATE INDEX "spot_gate_results_auditId_status_idx" ON "spot_gate_results"("auditId", "status");
CREATE UNIQUE INDEX "spot_rating_snapshots_auditId_key" ON "spot_rating_snapshots"("auditId");
CREATE INDEX "spot_rating_snapshots_offeringId_publishedAt_idx" ON "spot_rating_snapshots"("offeringId", "publishedAt");
CREATE INDEX "spot_rating_snapshots_expiresAt_idx" ON "spot_rating_snapshots"("expiresAt");
CREATE INDEX "spot_remediations_auditId_gateId_status_idx" ON "spot_remediations"("auditId", "gateId", "status");
CREATE INDEX "spot_appeals_offeringId_status_idx" ON "spot_appeals"("offeringId", "status");
CREATE INDEX "spot_appeals_snapshotId_idx" ON "spot_appeals"("snapshotId");

ALTER TABLE "spot_offerings"
  ADD CONSTRAINT "spot_offerings_spotId_fkey"
  FOREIGN KEY ("spotId") REFERENCES "spots"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "spot_audits"
  ADD CONSTRAINT "spot_audits_offeringId_fkey"
  FOREIGN KEY ("offeringId") REFERENCES "spot_offerings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "spot_audits"
  ADD CONSTRAINT "spot_audits_expertId_fkey"
  FOREIGN KEY ("expertId") REFERENCES "spot_experts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "spot_evidence"
  ADD CONSTRAINT "spot_evidence_auditId_fkey"
  FOREIGN KEY ("auditId") REFERENCES "spot_audits"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "spot_gate_results"
  ADD CONSTRAINT "spot_gate_results_auditId_fkey"
  FOREIGN KEY ("auditId") REFERENCES "spot_audits"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "spot_rating_snapshots"
  ADD CONSTRAINT "spot_rating_snapshots_offeringId_fkey"
  FOREIGN KEY ("offeringId") REFERENCES "spot_offerings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "spot_rating_snapshots"
  ADD CONSTRAINT "spot_rating_snapshots_auditId_fkey"
  FOREIGN KEY ("auditId") REFERENCES "spot_audits"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "spot_remediations"
  ADD CONSTRAINT "spot_remediations_auditId_fkey"
  FOREIGN KEY ("auditId") REFERENCES "spot_audits"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "spot_appeals"
  ADD CONSTRAINT "spot_appeals_offeringId_fkey"
  FOREIGN KEY ("offeringId") REFERENCES "spot_offerings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "spot_gate_results"
  ADD CONSTRAINT "spot_gate_results_gateId_check"
  CHECK ("gateId" IN ('G01','G02','G03','G04','G05','G06','G07','G08'));

ALTER TABLE "spot_gate_results"
  ADD CONSTRAINT "spot_gate_results_status_check"
  CHECK ("status" IN ('pass','fail','unknown'));

ALTER TABLE "spot_remediations"
  ADD CONSTRAINT "spot_remediations_gateId_check"
  CHECK ("gateId" = 'G05');

ALTER TABLE "spot_rating_snapshots"
  ADD CONSTRAINT "spot_rating_snapshots_score_check"
  CHECK ("officialScore" >= 0 AND "officialScore" <= 10);
