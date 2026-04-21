-- UGC growth loop: reward + referral (MVP). Без кошелька, без денег.

-- 1. Reward-статус и referralCode на UGC.
ALTER TABLE "program_ugc" ADD COLUMN "rewardStatus" TEXT NOT NULL DEFAULT 'none';
ALTER TABLE "program_ugc" ADD COLUMN "rewardGrantedAt" TIMESTAMP(3);
ALTER TABLE "program_ugc" ADD COLUMN "referralCode" TEXT;
CREATE UNIQUE INDEX "program_ugc_referralCode_key" ON "program_ugc"("referralCode");

-- 2. Таблица referral-кодов (один код на UGC, но связана сущность отдельно — для аналитики/будущих reward-политик).
CREATE TABLE "referral_codes" (
    "code" TEXT NOT NULL,
    "ownerUserId" TEXT,
    "ownerEmail" TEXT,
    "ownerUgcId" TEXT,
    "visits" INTEGER NOT NULL DEFAULT 0,
    "bookings" INTEGER NOT NULL DEFAULT 0,
    "lastVisitAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "referral_codes_pkey" PRIMARY KEY ("code")
);

CREATE INDEX "referral_codes_ownerEmail_idx" ON "referral_codes"("ownerEmail");
CREATE INDEX "referral_codes_ownerUserId_idx" ON "referral_codes"("ownerUserId");

ALTER TABLE "referral_codes"
    ADD CONSTRAINT "referral_codes_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "referral_codes"
    ADD CONSTRAINT "referral_codes_ownerUgcId_fkey" FOREIGN KEY ("ownerUgcId") REFERENCES "program_ugc"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- 3. Attribution на booking.
ALTER TABLE "bookings" ADD COLUMN "referralCode" TEXT;
CREATE INDEX "bookings_referralCode_idx" ON "bookings"("referralCode");

ALTER TABLE "bookings"
    ADD CONSTRAINT "bookings_referralCode_fkey" FOREIGN KEY ("referralCode") REFERENCES "referral_codes"("code") ON DELETE SET NULL ON UPDATE CASCADE;
