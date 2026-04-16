-- Trust + revenue foundation. Source: db_schema_draft, commission_data_contract, verification_framework.

CREATE TABLE "organizer_verification_evidence" (
    "id" TEXT NOT NULL,
    "organizerId" TEXT NOT NULL,
    "evidenceType" TEXT NOT NULL,
    "evidenceUrl" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "organizer_verification_evidence_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "reviews" (
    "id" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "programId" TEXT NOT NULL,
    "organizerId" TEXT NOT NULL,
    "rating" INTEGER NOT NULL,
    "comment" TEXT,
    "moderationStatus" TEXT NOT NULL DEFAULT 'pending',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reviews_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "incidents" (
    "id" TEXT NOT NULL,
    "bookingId" TEXT,
    "organizerId" TEXT NOT NULL,
    "programId" TEXT,
    "type" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "incidentStatus" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "incidents_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "commissions" (
    "id" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "organizerId" TEXT NOT NULL,
    "programId" TEXT NOT NULL,
    "gmvRub" INTEGER NOT NULL,
    "commissionRatePct" INTEGER,
    "commissionFixedRub" INTEGER,
    "commissionAccruedRub" INTEGER,
    "commissionCollectedRub" INTEGER,
    "invoiceStatus" TEXT,
    "paymentDueDate" TIMESTAMP(3),
    "paymentReceivedDate" TIMESTAMP(3),
    "reconciliationStatus" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "commissions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "reviews_bookingId_key" ON "reviews"("bookingId");
CREATE INDEX "organizer_verification_evidence_organizerId_idx" ON "organizer_verification_evidence"("organizerId");
CREATE INDEX "reviews_bookingId_idx" ON "reviews"("bookingId");
CREATE INDEX "reviews_programId_idx" ON "reviews"("programId");
CREATE INDEX "reviews_organizerId_idx" ON "reviews"("organizerId");
CREATE INDEX "incidents_bookingId_idx" ON "incidents"("bookingId");
CREATE INDEX "incidents_organizerId_idx" ON "incidents"("organizerId");
CREATE INDEX "incidents_programId_idx" ON "incidents"("programId");
CREATE INDEX "incidents_incidentStatus_idx" ON "incidents"("incidentStatus");
CREATE INDEX "commissions_bookingId_idx" ON "commissions"("bookingId");
CREATE INDEX "commissions_organizerId_idx" ON "commissions"("organizerId");
CREATE INDEX "commissions_programId_idx" ON "commissions"("programId");
CREATE INDEX "commissions_reconciliationStatus_idx" ON "commissions"("reconciliationStatus");

ALTER TABLE "organizer_verification_evidence" ADD CONSTRAINT "organizer_verification_evidence_organizerId_fkey" FOREIGN KEY ("organizerId") REFERENCES "organizers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "bookings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_programId_fkey" FOREIGN KEY ("programId") REFERENCES "programs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_organizerId_fkey" FOREIGN KEY ("organizerId") REFERENCES "organizers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "incidents" ADD CONSTRAINT "incidents_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "bookings"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "incidents" ADD CONSTRAINT "incidents_organizerId_fkey" FOREIGN KEY ("organizerId") REFERENCES "organizers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "incidents" ADD CONSTRAINT "incidents_programId_fkey" FOREIGN KEY ("programId") REFERENCES "programs"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "commissions" ADD CONSTRAINT "commissions_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "bookings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "commissions" ADD CONSTRAINT "commissions_organizerId_fkey" FOREIGN KEY ("organizerId") REFERENCES "organizers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "commissions" ADD CONSTRAINT "commissions_programId_fkey" FOREIGN KEY ("programId") REFERENCES "programs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
