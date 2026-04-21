-- Manual override governance: program multiplier / referral quality (TTL, admin API).

ALTER TABLE "programs" ADD COLUMN "economicsOverrideMode" TEXT;
ALTER TABLE "programs" ADD COLUMN "economicsOverrideReason" TEXT;
ALTER TABLE "programs" ADD COLUMN "economicsOverrideUntil" TIMESTAMP(3);
ALTER TABLE "programs" ADD COLUMN "economicsOverrideUpdatedAt" TIMESTAMP(3);

CREATE INDEX "programs_economics_override_until_idx" ON "programs" ("economicsOverrideUntil");

ALTER TABLE "referral_codes" ADD COLUMN "economicsOverrideMode" TEXT;
ALTER TABLE "referral_codes" ADD COLUMN "economicsOverrideReason" TEXT;
ALTER TABLE "referral_codes" ADD COLUMN "economicsOverrideUntil" TIMESTAMP(3);
ALTER TABLE "referral_codes" ADD COLUMN "economicsOverrideUpdatedAt" TIMESTAMP(3);

CREATE INDEX "referral_codes_economics_override_until_idx" ON "referral_codes" ("economicsOverrideUntil");
