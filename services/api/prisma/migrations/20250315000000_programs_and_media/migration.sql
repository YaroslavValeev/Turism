-- programs + program_media. Source: program_card_schema.md, db_schema_draft.csv

CREATE TABLE "programs" (
    "id" TEXT NOT NULL,
    "organizerId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "discipline" TEXT NOT NULL,
    "region" TEXT NOT NULL,
    "exactLocation" TEXT,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "durationDays" INTEGER NOT NULL,
    "formatType" TEXT,
    "audienceFit" TEXT,
    "levelRequired" TEXT,
    "riskLevel" TEXT,
    "priceFromRub" INTEGER,
    "currency" TEXT DEFAULT 'RUB',
    "inclusions" TEXT,
    "exclusions" TEXT,
    "gearRequirements" TEXT,
    "medicalLimitations" TEXT,
    "itineraryDayByDay" TEXT,
    "organizerName" TEXT,
    "trustReason" TEXT,
    "reviewsSummary" TEXT,
    "cancellationRules" TEXT,
    "whatHappensAfterBooking" TEXT,
    "cta" TEXT,
    "publishStatus" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "programs_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "program_media" (
    "id" TEXT NOT NULL,
    "programId" TEXT NOT NULL,
    "mediaType" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "caption" TEXT,

    CONSTRAINT "program_media_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "programs_organizerId_idx" ON "programs"("organizerId");
CREATE INDEX "programs_publishStatus_idx" ON "programs"("publishStatus");
CREATE INDEX "program_media_programId_idx" ON "program_media"("programId");

ALTER TABLE "programs" ADD CONSTRAINT "programs_organizerId_fkey" FOREIGN KEY ("organizerId") REFERENCES "organizers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "program_media" ADD CONSTRAINT "program_media_programId_fkey" FOREIGN KEY ("programId") REFERENCES "programs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
