-- Фиксация согласий PDP в БД (Gate 1): не только валидация на фронте
ALTER TABLE "bookings" ADD COLUMN "legalConsentAt" TIMESTAMP(3);
ALTER TABLE "bookings" ADD COLUMN "legalConsentPolicyVersion" TEXT;
