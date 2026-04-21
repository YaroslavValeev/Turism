-- Stage A: явная связь Source ↔ OrganizerExternalChannel для contract-auto onboarding.

ALTER TABLE "sources" ADD COLUMN "externalChannelId" TEXT;

CREATE INDEX "sources_externalChannelId_idx" ON "sources"("externalChannelId");

ALTER TABLE "sources" ADD CONSTRAINT "sources_externalChannelId_fkey" FOREIGN KEY ("externalChannelId") REFERENCES "organizer_external_channels"("id") ON DELETE SET NULL ON UPDATE CASCADE;
