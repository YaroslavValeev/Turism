-- Governance economics alerts v1
CREATE TABLE "governance_alerts" (
    "id" TEXT NOT NULL,
    "fingerprint" TEXT NOT NULL,
    "alertType" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "detail" TEXT,
    "payloadJson" JSONB,
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSentAt" TIMESTAMP(3),
    "lastDigestAt" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'open',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "governance_alerts_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "governance_alerts_fingerprint_key" ON "governance_alerts"("fingerprint");

CREATE INDEX "governance_alerts_status_severity_lastSeenAt_idx" ON "governance_alerts"("status", "severity", "lastSeenAt");

CREATE INDEX "governance_alerts_severity_status_idx" ON "governance_alerts"("severity", "status");

CREATE TABLE "governance_digest_state" (
    "id" TEXT NOT NULL,
    "lastDigestSentAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "governance_digest_state_pkey" PRIMARY KEY ("id")
);
