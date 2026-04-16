-- Commission uniqueness: one Commission per bookingId (Sprint 2 Checkpoint 2 correction).
CREATE UNIQUE INDEX "commissions_bookingId_key" ON "commissions"("bookingId");
