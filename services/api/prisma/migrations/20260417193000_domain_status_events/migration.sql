-- Stage 4: centralized domain status events (separate from analytics_events).

CREATE TABLE "domain_status_events" (
    "id" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "fromStatus" TEXT,
    "toStatus" TEXT,
    "triggerMode" TEXT NOT NULL,
    "actorId" TEXT,
    "actorMarker" TEXT,
    "reason" TEXT,
    "source" TEXT,
    "payloadJson" JSONB,
    "idempotencyKey" TEXT,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "domain_status_events_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "domain_status_events_idempotencyKey_key" ON "domain_status_events"("idempotencyKey");

CREATE INDEX "domain_status_events_entityType_entityId_occurredAt_idx" ON "domain_status_events"("entityType", "entityId", "occurredAt");

CREATE INDEX "domain_status_events_occurredAt_idx" ON "domain_status_events"("occurredAt");
