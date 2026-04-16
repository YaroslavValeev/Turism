-- Traveler key (hashed), mart refresh audit log, organizer/program score snapshots

ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "travelerKeyHash" TEXT;
ALTER TABLE "bookings" ADD COLUMN IF NOT EXISTS "travelerKeyHash" TEXT;

CREATE INDEX IF NOT EXISTS "leads_travelerKeyHash_idx" ON "leads"("travelerKeyHash");
CREATE INDEX IF NOT EXISTS "bookings_travelerKeyHash_idx" ON "bookings"("travelerKeyHash");

CREATE TABLE IF NOT EXISTS "analytics_mart_refresh_logs" (
    "id" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "message" TEXT,
    "durationMs" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "analytics_mart_refresh_logs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "analytics_mart_refresh_logs_createdAt_idx" ON "analytics_mart_refresh_logs"("createdAt");

CREATE TABLE IF NOT EXISTS "organizer_score_snapshots" (
    "id" TEXT NOT NULL,
    "organizerId" TEXT NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "organizerScore" DOUBLE PRECISION NOT NULL,
    "scoreBand" TEXT NOT NULL,
    "componentsJson" JSONB NOT NULL,
    "sampleBookings" INTEGER NOT NULL DEFAULT 0,
    "recalculatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "organizer_score_snapshots_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "organizer_score_snapshots_organizerId_fkey" FOREIGN KEY ("organizerId") REFERENCES "organizers"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "organizer_score_snapshots_organizerId_periodEnd_key" ON "organizer_score_snapshots"("organizerId", "periodEnd");
CREATE INDEX IF NOT EXISTS "organizer_score_snapshots_recalculatedAt_idx" ON "organizer_score_snapshots"("recalculatedAt");

CREATE TABLE IF NOT EXISTS "program_score_snapshots" (
    "id" TEXT NOT NULL,
    "programId" TEXT NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "programContentScore" DOUBLE PRECISION,
    "programPerformanceScore" DOUBLE PRECISION,
    "totalProgramScore" DOUBLE PRECISION NOT NULL,
    "scoreBand" TEXT NOT NULL,
    "componentsJson" JSONB NOT NULL,
    "sampleViews" INTEGER NOT NULL DEFAULT 0,
    "recalculatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "program_score_snapshots_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "program_score_snapshots_programId_fkey" FOREIGN KEY ("programId") REFERENCES "programs"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "program_score_snapshots_programId_periodEnd_key" ON "program_score_snapshots"("programId", "periodEnd");
CREATE INDEX IF NOT EXISTS "program_score_snapshots_recalculatedAt_idx" ON "program_score_snapshots"("recalculatedAt");
