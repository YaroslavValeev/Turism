-- Leading indicators: short vs long window (early warning), отдельно от reactive guardrails.

ALTER TABLE "programs" ADD COLUMN "economicsEarlyWarningFlag" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "programs" ADD COLUMN "economicsEarlyWarningReason" TEXT;
ALTER TABLE "programs" ADD COLUMN "economicsEarlyWarningAt" TIMESTAMP(3);
ALTER TABLE "programs" ADD COLUMN "economicsEarlyWarningSnapshot" JSONB;

ALTER TABLE "referral_codes" ADD COLUMN "economicsEarlyWarningFlag" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "referral_codes" ADD COLUMN "economicsEarlyWarningReason" TEXT;
ALTER TABLE "referral_codes" ADD COLUMN "economicsEarlyWarningAt" TIMESTAMP(3);
ALTER TABLE "referral_codes" ADD COLUMN "economicsEarlyWarningSnapshot" JSONB;
