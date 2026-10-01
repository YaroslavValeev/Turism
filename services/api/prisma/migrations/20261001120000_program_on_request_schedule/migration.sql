-- AlterTable
ALTER TABLE "programs" ADD COLUMN     "scheduleType" TEXT NOT NULL DEFAULT 'fixed',
ADD COLUMN     "seasonLabel" TEXT;
