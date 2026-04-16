-- AlterTable
ALTER TABLE "billing_statements" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "commissions" ALTER COLUMN "gmvRub" SET DEFAULT 0;

-- AlterTable
ALTER TABLE "leads" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "organizer_billing_profiles" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "organizer_contracts" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "payments" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "refunds" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- CreateTable
CREATE TABLE "review_requests" (
    "id" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "organizerId" TEXT NOT NULL,
    "programId" TEXT NOT NULL,
    "guestContact" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'queued',
    "requestToken" TEXT NOT NULL,
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "firstSentAt" TIMESTAMP(3),
    "lastSentAt" TIMESTAMP(3),
    "nextReminderAt" TIMESTAMP(3),
    "reminderCount" INTEGER NOT NULL DEFAULT 0,
    "maxReminders" INTEGER NOT NULL DEFAULT 2,
    "lastAttemptAt" TIMESTAMP(3),
    "lastError" TEXT,
    "bookingCompletedAt" TIMESTAMP(3),

    CONSTRAINT "review_requests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "review_requests_bookingId_key" ON "review_requests"("bookingId");

-- CreateIndex
CREATE UNIQUE INDEX "review_requests_requestToken_key" ON "review_requests"("requestToken");

-- CreateIndex
CREATE INDEX "review_requests_status_nextReminderAt_idx" ON "review_requests"("status", "nextReminderAt");

-- CreateIndex
CREATE INDEX "review_requests_organizerId_status_idx" ON "review_requests"("organizerId", "status");

-- AddForeignKey
ALTER TABLE "review_requests" ADD CONSTRAINT "review_requests_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "bookings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "review_requests" ADD CONSTRAINT "review_requests_organizerId_fkey" FOREIGN KEY ("organizerId") REFERENCES "organizers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "review_requests" ADD CONSTRAINT "review_requests_programId_fkey" FOREIGN KEY ("programId") REFERENCES "programs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
