-- Reward billing (Model A: скидка уменьшает цену пользователя, комиссия — с уменьшенной суммы).
-- originalAmountRub, discountAmountRub, finalAmountRub фиксируют экономику конкретного booking.

ALTER TABLE "bookings" ADD COLUMN "originalAmountRub" INTEGER;
ALTER TABLE "bookings" ADD COLUMN "discountAmountRub" INTEGER;
ALTER TABLE "bookings" ADD COLUMN "finalAmountRub" INTEGER;

CREATE INDEX "bookings_discountAmountRub_idx" ON "bookings"("discountAmountRub") WHERE "discountAmountRub" IS NOT NULL;
