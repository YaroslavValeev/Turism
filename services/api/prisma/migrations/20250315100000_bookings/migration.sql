-- Booking = canonical business entity. Source: booking_data_contract.md, db_schema_draft.csv

CREATE TABLE "bookings" (
    "id" TEXT NOT NULL,
    "programId" TEXT NOT NULL,
    "organizerId" TEXT NOT NULL,
    "guestContact" TEXT NOT NULL,
    "sourceChannel" TEXT,
    "sourceCampaign" TEXT,
    "partnerId" TEXT,
    "leadOwner" TEXT,
    "bookingStatus" TEXT NOT NULL,
    "firstResponseAt" TIMESTAMP(3),
    "bookedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "cancellationReason" TEXT,
    "refundAmountRub" INTEGER,
    "gmvRub" INTEGER,
    "expectedCommissionRub" INTEGER,
    "accruedCommissionRub" INTEGER,
    "collectedCommissionRub" INTEGER,
    "proofOfCompletion" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "bookings_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "bookings_programId_idx" ON "bookings"("programId");
CREATE INDEX "bookings_organizerId_idx" ON "bookings"("organizerId");
CREATE INDEX "bookings_bookingStatus_idx" ON "bookings"("bookingStatus");

ALTER TABLE "bookings" ADD CONSTRAINT "bookings_programId_fkey" FOREIGN KEY ("programId") REFERENCES "programs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_organizerId_fkey" FOREIGN KEY ("organizerId") REFERENCES "organizers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
