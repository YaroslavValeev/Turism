-- UGC after completed booking: запрос + пользовательский контент с модерацией.

CREATE TABLE "program_ugc_requests" (
    "id" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "programId" TEXT NOT NULL,
    "organizerId" TEXT NOT NULL,
    "recipientEmail" TEXT,
    "status" TEXT NOT NULL DEFAULT 'queued',
    "requestToken" TEXT NOT NULL,
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "firstSentAt" TIMESTAMP(3),
    "lastSentAt" TIMESTAMP(3),
    "lastAttemptAt" TIMESTAMP(3),
    "lastError" TEXT,
    "bookingCompletedAt" TIMESTAMP(3),
    "submittedUgcId" TEXT,

    CONSTRAINT "program_ugc_requests_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "program_ugc_requests_bookingId_key" ON "program_ugc_requests"("bookingId");
CREATE UNIQUE INDEX "program_ugc_requests_requestToken_key" ON "program_ugc_requests"("requestToken");
CREATE INDEX "program_ugc_requests_status_idx" ON "program_ugc_requests"("status");
CREATE INDEX "program_ugc_requests_programId_idx" ON "program_ugc_requests"("programId");

ALTER TABLE "program_ugc_requests"
    ADD CONSTRAINT "program_ugc_requests_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "bookings"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "program_ugc_requests"
    ADD CONSTRAINT "program_ugc_requests_programId_fkey" FOREIGN KEY ("programId") REFERENCES "programs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "program_ugc_requests"
    ADD CONSTRAINT "program_ugc_requests_organizerId_fkey" FOREIGN KEY ("organizerId") REFERENCES "organizers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "program_ugc" (
    "id" TEXT NOT NULL,
    "programId" TEXT NOT NULL,
    "organizerId" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "userId" TEXT,
    "authorName" TEXT NOT NULL,
    "contactEmail" TEXT,
    "textReview" TEXT NOT NULL,
    "rating" INTEGER,
    "mediaUrls" JSONB NOT NULL DEFAULT '[]',
    "consentToPublish" BOOLEAN NOT NULL DEFAULT false,
    "moderationStatus" TEXT NOT NULL DEFAULT 'pending',
    "moderationNotes" TEXT,
    "source" TEXT NOT NULL DEFAULT 'post_trip_request',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewedAt" TIMESTAMP(3),

    CONSTRAINT "program_ugc_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "program_ugc_bookingId_key" ON "program_ugc"("bookingId");
CREATE INDEX "program_ugc_programId_moderationStatus_idx" ON "program_ugc"("programId", "moderationStatus");
CREATE INDEX "program_ugc_moderationStatus_createdAt_idx" ON "program_ugc"("moderationStatus", "createdAt");

ALTER TABLE "program_ugc"
    ADD CONSTRAINT "program_ugc_programId_fkey" FOREIGN KEY ("programId") REFERENCES "programs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "program_ugc"
    ADD CONSTRAINT "program_ugc_organizerId_fkey" FOREIGN KEY ("organizerId") REFERENCES "organizers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "program_ugc"
    ADD CONSTRAINT "program_ugc_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "bookings"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "program_ugc"
    ADD CONSTRAINT "program_ugc_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "program_ugc_requests"
    ADD CONSTRAINT "program_ugc_requests_submittedUgcId_fkey" FOREIGN KEY ("submittedUgcId") REFERENCES "program_ugc"("id") ON DELETE SET NULL ON UPDATE CASCADE;
