-- Add passwordHash for admin login. User = admin/internal actor only in Sprint 1.
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "passwordHash" TEXT;
