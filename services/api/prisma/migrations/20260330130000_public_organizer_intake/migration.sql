-- CreateTable
CREATE TABLE "public_organizer_intakes" (
    "id" TEXT NOT NULL,
    "intakeType" TEXT NOT NULL,
    "contactName" TEXT NOT NULL,
    "contactEmail" TEXT NOT NULL,
    "contactPhone" TEXT,
    "organization" TEXT,
    "programTitle" TEXT,
    "discipline" TEXT,
    "region" TEXT,
    "plannedDates" TEXT,
    "message" TEXT,
    "links" TEXT,
    "meta" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "public_organizer_intakes_pkey" PRIMARY KEY ("id")
);
