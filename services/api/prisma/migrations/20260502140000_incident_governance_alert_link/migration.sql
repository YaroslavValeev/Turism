-- Correlation: incidents ↔ governance_alerts (optional FK) + SLA deadline field.

ALTER TABLE "incidents" ADD COLUMN "governanceAlertId" TEXT;
ALTER TABLE "incidents" ADD COLUMN "slaDueAt" TIMESTAMP(3);

CREATE INDEX "incidents_governanceAlertId_idx" ON "incidents"("governanceAlertId");

ALTER TABLE "incidents" ADD CONSTRAINT "incidents_governanceAlertId_fkey" FOREIGN KEY ("governanceAlertId") REFERENCES "governance_alerts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
