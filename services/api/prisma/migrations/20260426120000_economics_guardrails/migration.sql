ALTER TABLE "programs" ADD COLUMN "economicsRewardSuspended" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "programs" ADD COLUMN "economicsRewardValueMultiplierBps" INTEGER NOT NULL DEFAULT 10000;
ALTER TABLE "programs" ADD COLUMN "economicsGuardrailReason" TEXT;
ALTER TABLE "programs" ADD COLUMN "economicsGuardrailUpdatedAt" TIMESTAMP(3);

ALTER TABLE "referral_codes" ADD COLUMN "economicsLowQuality" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "referral_codes" ADD COLUMN "economicsLowQualityReason" TEXT;
ALTER TABLE "referral_codes" ADD COLUMN "economicsLowQualityAt" TIMESTAMP(3);

CREATE INDEX "referral_codes_economicsLowQuality_idx" ON "referral_codes"("economicsLowQuality");
