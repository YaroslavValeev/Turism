-- Denormalized organizerId for cooldown queries + FKs for ProgramConversionDelivery.

ALTER TABLE "program_conversion_deliveries" ADD COLUMN "organizerId" TEXT;

UPDATE "program_conversion_deliveries" AS d
SET "organizerId" = p."organizerId"
FROM "programs" AS p
WHERE p.id = d."programId";

ALTER TABLE "program_conversion_deliveries" ALTER COLUMN "organizerId" SET NOT NULL;

CREATE INDEX "program_conversion_deliveries_organizerId_sentAt_idx" ON "program_conversion_deliveries"("organizerId", "sentAt");

ALTER TABLE "program_conversion_deliveries" ADD CONSTRAINT "program_conversion_deliveries_programId_fkey" FOREIGN KEY ("programId") REFERENCES "programs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "program_conversion_deliveries" ADD CONSTRAINT "program_conversion_deliveries_organizerId_fkey" FOREIGN KEY ("organizerId") REFERENCES "organizers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
