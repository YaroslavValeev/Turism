-- UGC growth loop hardening: self-use / duplicate guard, rewards table, abuse events.

-- 1. Таблица reward-ов пользователей (MVP: percent или fixed amount).
CREATE TABLE "user_rewards" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "email" TEXT,
    "source" TEXT NOT NULL DEFAULT 'ugc',
    "sourceRefId" TEXT,
    "valueType" TEXT NOT NULL DEFAULT 'percent',
    "value" INTEGER NOT NULL,
    "currency" TEXT,
    "status" TEXT NOT NULL DEFAULT 'available',
    "usedBookingId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "usedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),

    CONSTRAINT "user_rewards_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "user_rewards_userId_status_idx" ON "user_rewards"("userId", "status");
CREATE INDEX "user_rewards_email_status_idx" ON "user_rewards"("email", "status");
CREATE INDEX "user_rewards_source_sourceRefId_idx" ON "user_rewards"("source", "sourceRefId");

ALTER TABLE "user_rewards"
    ADD CONSTRAINT "user_rewards_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- 2. Реверсная привязка booking → применённый reward.
ALTER TABLE "bookings" ADD COLUMN "appliedRewardId" TEXT;
CREATE UNIQUE INDEX "bookings_appliedRewardId_key" ON "bookings"("appliedRewardId");
ALTER TABLE "bookings"
    ADD CONSTRAINT "bookings_appliedRewardId_fkey" FOREIGN KEY ("appliedRewardId") REFERENCES "user_rewards"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- user_rewards.usedBookingId → bookings.id (создаём после booking FK, т.к. таблица bookings уже существует).
ALTER TABLE "user_rewards"
    ADD CONSTRAINT "user_rewards_usedBookingId_fkey" FOREIGN KEY ("usedBookingId") REFERENCES "bookings"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- 3. Журнал отказов по referral-коду (self-use / duplicate / rate_limited).
CREATE TABLE "referral_abuse_events" (
    "id" TEXT NOT NULL,
    "code" TEXT,
    "reason" TEXT NOT NULL,
    "email" TEXT,
    "userId" TEXT,
    "programId" TEXT,
    "bookingId" TEXT,
    "detail" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "referral_abuse_events_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "referral_abuse_events_reason_createdAt_idx" ON "referral_abuse_events"("reason", "createdAt");
CREATE INDEX "referral_abuse_events_code_idx" ON "referral_abuse_events"("code");
