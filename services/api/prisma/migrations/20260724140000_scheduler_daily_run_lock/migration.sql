-- Durable lease for scheduler jobs. Additive only; no existing data is changed.

CREATE TABLE "scheduler_daily_runs" (
    "id" TEXT NOT NULL,
    "jobKey" TEXT NOT NULL,
    "dayKey" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'running',
    "leaseToken" TEXT NOT NULL,
    "leaseExpiresAt" TIMESTAMP(3) NOT NULL,
    "completedAt" TIMESTAMP(3),
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "scheduler_daily_runs_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "scheduler_daily_runs_jobKey_dayKey_key"
ON "scheduler_daily_runs"("jobKey", "dayKey");

CREATE INDEX "scheduler_daily_runs_status_leaseExpiresAt_idx"
ON "scheduler_daily_runs"("status", "leaseExpiresAt");
