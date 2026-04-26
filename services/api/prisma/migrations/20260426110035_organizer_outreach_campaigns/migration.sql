-- CreateTable
CREATE TABLE "organizer_outreach_campaigns" (
    "id" TEXT NOT NULL,
    "organizerId" TEXT NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "viewsCount" INTEGER NOT NULL DEFAULT 0,
    "clicksCount" INTEGER NOT NULL DEFAULT 0,
    "leadsCount" INTEGER NOT NULL DEFAULT 0,
    "dealsCount" INTEGER NOT NULL DEFAULT 0,
    "dealAmountTotal" INTEGER NOT NULL DEFAULT 0,
    "templateType" TEXT NOT NULL,
    "emailSubject" TEXT NOT NULL,
    "emailBody" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "ownerApprovedAt" TIMESTAMP(3),
    "sentAt" TIMESTAMP(3),
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "organizer_outreach_campaigns_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "organizer_outreach_campaigns_status_createdAt_idx" ON "organizer_outreach_campaigns"("status", "createdAt");

-- CreateIndex
CREATE INDEX "organizer_outreach_campaigns_organizerId_idx" ON "organizer_outreach_campaigns"("organizerId");

-- CreateIndex
CREATE UNIQUE INDEX "organizer_outreach_campaigns_organizerId_periodStart_period_key" ON "organizer_outreach_campaigns"("organizerId", "periodStart", "periodEnd");

-- AddForeignKey
ALTER TABLE "organizer_outreach_campaigns" ADD CONSTRAINT "organizer_outreach_campaigns_organizerId_fkey" FOREIGN KEY ("organizerId") REFERENCES "organizers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
