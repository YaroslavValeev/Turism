-- AlterTable
ALTER TABLE "programs" ADD COLUMN     "aiEnrichment" JSONB,
ADD COLUMN     "manualFields" TEXT[] DEFAULT ARRAY[]::TEXT[];
