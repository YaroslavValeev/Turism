-- Reward recovery on cancel/refund:
--   - bookings.cancellationKind — классификация причины отмены (enum-строка).
--   - user_rewards.recoveredAt / recoveredCancellationKind — lifecycle-событие возврата.

ALTER TABLE "bookings" ADD COLUMN "cancellationKind" TEXT;
CREATE INDEX "bookings_cancellationKind_idx" ON "bookings"("cancellationKind") WHERE "cancellationKind" IS NOT NULL;

ALTER TABLE "user_rewards" ADD COLUMN "recoveredAt" TIMESTAMP(3);
ALTER TABLE "user_rewards" ADD COLUMN "recoveredCancellationKind" TEXT;
CREATE INDEX "user_rewards_recoveredAt_idx" ON "user_rewards"("recoveredAt") WHERE "recoveredAt" IS NOT NULL;
