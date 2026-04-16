-- Fair Success Fee 3% billing contour.
-- MVP: manual off-platform payments/refunds, one aggregate commission per booking.

ALTER TABLE "organizers"
  ADD COLUMN IF NOT EXISTS "onboardingStatus" TEXT NOT NULL DEFAULT 'applied',
  ADD COLUMN IF NOT EXISTS "billingStatus" TEXT NOT NULL DEFAULT 'not_connected',
  ADD COLUMN IF NOT EXISTS "privilegeStatus" TEXT NOT NULL DEFAULT 'limited',
  ADD COLUMN IF NOT EXISTS "commissionRateBps" INTEGER NOT NULL DEFAULT 300;

CREATE TABLE IF NOT EXISTS "leads" (
  "id" TEXT NOT NULL,
  "programId" TEXT NOT NULL,
  "organizerId" TEXT NOT NULL,
  "source" TEXT NOT NULL DEFAULT 'mywave',
  "guestContact" TEXT NOT NULL,
  "sourceChannel" TEXT,
  "sourceCampaign" TEXT,
  "partnerId" TEXT,
  "firstContactAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "attributionWindowDays" INTEGER NOT NULL DEFAULT 60,
  "leadStatus" TEXT NOT NULL DEFAULT 'new',
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "leads_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "bookings"
  ADD COLUMN IF NOT EXISTS "leadId" TEXT,
  ADD COLUMN IF NOT EXISTS "source" TEXT NOT NULL DEFAULT 'mywave',
  ADD COLUMN IF NOT EXISTS "attributionWindowDays" INTEGER NOT NULL DEFAULT 60,
  ADD COLUMN IF NOT EXISTS "paidAmountRub" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "refundedAmountRub" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "netAmountRub" INTEGER NOT NULL DEFAULT 0;

INSERT INTO "leads" (
  "id",
  "programId",
  "organizerId",
  "source",
  "guestContact",
  "sourceChannel",
  "sourceCampaign",
  "partnerId",
  "firstContactAt",
  "attributionWindowDays",
  "leadStatus",
  "notes",
  "createdAt",
  "updatedAt"
)
SELECT
  'lead_' || b."id",
  b."programId",
  b."organizerId",
  'mywave',
  b."guestContact",
  b."sourceChannel",
  b."sourceCampaign",
  b."partnerId",
  b."createdAt",
  60,
  CASE
    WHEN b."bookingStatus" IN ('contacted', 'sent_to_organizer', 'offer_sent', 'booked', 'paid_off_platform', 'completed') THEN 'contacted'
    WHEN b."bookingStatus" IN ('cancelled_user', 'cancelled_organizer') THEN 'rejected'
    ELSE 'new'
  END,
  b."notes",
  b."createdAt",
  b."updatedAt"
FROM "bookings" b
WHERE b."leadId" IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM "leads" l WHERE l."id" = 'lead_' || b."id"
  );

UPDATE "bookings"
SET "leadId" = 'lead_' || "id"
WHERE "leadId" IS NULL
  AND EXISTS (
    SELECT 1 FROM "leads" l WHERE l."id" = 'lead_' || "bookings"."id"
  );

CREATE TABLE IF NOT EXISTS "payments" (
  "id" TEXT NOT NULL,
  "bookingId" TEXT NOT NULL,
  "leadId" TEXT,
  "organizerId" TEXT NOT NULL,
  "programId" TEXT NOT NULL,
  "amountRub" INTEGER NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'confirmed',
  "paymentKind" TEXT NOT NULL DEFAULT 'full',
  "paidAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "externalReference" TEXT,
  "paymentMethod" TEXT,
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "refunds" (
  "id" TEXT NOT NULL,
  "bookingId" TEXT NOT NULL,
  "paymentId" TEXT,
  "leadId" TEXT,
  "organizerId" TEXT NOT NULL,
  "programId" TEXT NOT NULL,
  "amountRub" INTEGER NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'completed',
  "reason" TEXT,
  "refundedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "externalReference" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "refunds_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "organizer_billing_profiles" (
  "id" TEXT NOT NULL,
  "organizerId" TEXT NOT NULL,
  "legalType" TEXT,
  "legalName" TEXT,
  "inn" TEXT,
  "bankName" TEXT,
  "bankBik" TEXT,
  "bankAccount" TEXT,
  "correspondentAccount" TEXT,
  "contactEmail" TEXT,
  "contactPhone" TEXT,
  "cancellationPolicy" TEXT,
  "refundPolicy" TEXT,
  "commissionRateBps" INTEGER NOT NULL DEFAULT 300,
  "billingStatus" TEXT NOT NULL DEFAULT 'not_connected',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "organizer_billing_profiles_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "organizer_contracts" (
  "id" TEXT NOT NULL,
  "organizerId" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'not_generated',
  "documentUrl" TEXT,
  "generatedAt" TIMESTAMP(3),
  "sentAt" TIMESTAMP(3),
  "signedAt" TIMESTAMP(3),
  "expiresAt" TIMESTAMP(3),
  "rejectedAt" TIMESTAMP(3),
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "organizer_contracts_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "commissions"
  ADD COLUMN IF NOT EXISTS "leadId" TEXT,
  ADD COLUMN IF NOT EXISTS "commissionRateBps" INTEGER NOT NULL DEFAULT 300,
  ADD COLUMN IF NOT EXISTS "commissionBaseRub" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "commissionAmountRub" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "calculationJson" JSONB,
  ADD COLUMN IF NOT EXISTS "accruedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "approvedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "invoicedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "paidAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "reversedAt" TIMESTAMP(3);

UPDATE "commissions" c
SET
  "leadId" = b."leadId",
  "commissionBaseRub" = COALESCE(NULLIF(c."gmvRub", 0), b."netAmountRub", 0),
  "commissionRateBps" = COALESCE(c."commissionRatePct", 3) * 100,
  "commissionAmountRub" = COALESCE(
    c."commissionAccruedRub",
    ROUND((COALESCE(NULLIF(c."gmvRub", 0), b."netAmountRub", 0) * COALESCE(c."commissionRatePct", 3)) / 100.0)::INTEGER,
    0
  ),
  "accruedAt" = CASE
    WHEN c."reconciliationStatus" IN ('accrued', 'invoiced', 'paid') THEN c."createdAt"
    ELSE c."accruedAt"
  END
FROM "bookings" b
WHERE c."bookingId" = b."id";

CREATE TABLE IF NOT EXISTS "billing_statements" (
  "id" TEXT NOT NULL,
  "organizerId" TEXT NOT NULL,
  "periodStart" TIMESTAMP(3) NOT NULL,
  "periodEnd" TIMESTAMP(3) NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'draft',
  "grossPaidRub" INTEGER NOT NULL DEFAULT 0,
  "refundedRub" INTEGER NOT NULL DEFAULT 0,
  "netSalesRub" INTEGER NOT NULL DEFAULT 0,
  "commissionTotalRub" INTEGER NOT NULL DEFAULT 0,
  "objectionDeadline" TIMESTAMP(3),
  "issuedAt" TIMESTAMP(3),
  "paidAt" TIMESTAMP(3),
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "billing_statements_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "billing_statement_lines" (
  "id" TEXT NOT NULL,
  "statementId" TEXT NOT NULL,
  "commissionId" TEXT NOT NULL,
  "bookingId" TEXT NOT NULL,
  "paidAmountRub" INTEGER NOT NULL DEFAULT 0,
  "refundedAmountRub" INTEGER NOT NULL DEFAULT 0,
  "netAmountRub" INTEGER NOT NULL DEFAULT 0,
  "commissionRateBps" INTEGER NOT NULL DEFAULT 300,
  "commissionAmountRub" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "billing_statement_lines_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "organizer_billing_profiles_organizerId_key" ON "organizer_billing_profiles"("organizerId");
CREATE INDEX IF NOT EXISTS "leads_organizerId_leadStatus_idx" ON "leads"("organizerId", "leadStatus");
CREATE INDEX IF NOT EXISTS "leads_programId_firstContactAt_idx" ON "leads"("programId", "firstContactAt");
CREATE INDEX IF NOT EXISTS "bookings_leadId_idx" ON "bookings"("leadId");
CREATE INDEX IF NOT EXISTS "bookings_organizerId_bookingStatus_idx" ON "bookings"("organizerId", "bookingStatus");
CREATE INDEX IF NOT EXISTS "payments_bookingId_paidAt_idx" ON "payments"("bookingId", "paidAt");
CREATE INDEX IF NOT EXISTS "payments_organizerId_paidAt_idx" ON "payments"("organizerId", "paidAt");
CREATE INDEX IF NOT EXISTS "refunds_bookingId_refundedAt_idx" ON "refunds"("bookingId", "refundedAt");
CREATE INDEX IF NOT EXISTS "refunds_organizerId_refundedAt_idx" ON "refunds"("organizerId", "refundedAt");
CREATE INDEX IF NOT EXISTS "organizer_contracts_organizerId_status_idx" ON "organizer_contracts"("organizerId", "status");
CREATE INDEX IF NOT EXISTS "commissions_organizerId_reconciliationStatus_idx" ON "commissions"("organizerId", "reconciliationStatus");
CREATE INDEX IF NOT EXISTS "commissions_leadId_idx" ON "commissions"("leadId");
CREATE INDEX IF NOT EXISTS "billing_statements_organizerId_periodStart_periodEnd_idx" ON "billing_statements"("organizerId", "periodStart", "periodEnd");
CREATE INDEX IF NOT EXISTS "billing_statements_status_idx" ON "billing_statements"("status");
CREATE INDEX IF NOT EXISTS "billing_statement_lines_statementId_idx" ON "billing_statement_lines"("statementId");
CREATE INDEX IF NOT EXISTS "billing_statement_lines_commissionId_idx" ON "billing_statement_lines"("commissionId");
CREATE INDEX IF NOT EXISTS "billing_statement_lines_bookingId_idx" ON "billing_statement_lines"("bookingId");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'leads_programId_fkey') THEN
    ALTER TABLE "leads" ADD CONSTRAINT "leads_programId_fkey" FOREIGN KEY ("programId") REFERENCES "programs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'leads_organizerId_fkey') THEN
    ALTER TABLE "leads" ADD CONSTRAINT "leads_organizerId_fkey" FOREIGN KEY ("organizerId") REFERENCES "organizers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'bookings_leadId_fkey') THEN
    ALTER TABLE "bookings" ADD CONSTRAINT "bookings_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "leads"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'payments_bookingId_fkey') THEN
    ALTER TABLE "payments" ADD CONSTRAINT "payments_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "bookings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'payments_leadId_fkey') THEN
    ALTER TABLE "payments" ADD CONSTRAINT "payments_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "leads"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'payments_organizerId_fkey') THEN
    ALTER TABLE "payments" ADD CONSTRAINT "payments_organizerId_fkey" FOREIGN KEY ("organizerId") REFERENCES "organizers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'payments_programId_fkey') THEN
    ALTER TABLE "payments" ADD CONSTRAINT "payments_programId_fkey" FOREIGN KEY ("programId") REFERENCES "programs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'refunds_bookingId_fkey') THEN
    ALTER TABLE "refunds" ADD CONSTRAINT "refunds_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "bookings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'refunds_paymentId_fkey') THEN
    ALTER TABLE "refunds" ADD CONSTRAINT "refunds_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "payments"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'refunds_leadId_fkey') THEN
    ALTER TABLE "refunds" ADD CONSTRAINT "refunds_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "leads"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'refunds_organizerId_fkey') THEN
    ALTER TABLE "refunds" ADD CONSTRAINT "refunds_organizerId_fkey" FOREIGN KEY ("organizerId") REFERENCES "organizers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'refunds_programId_fkey') THEN
    ALTER TABLE "refunds" ADD CONSTRAINT "refunds_programId_fkey" FOREIGN KEY ("programId") REFERENCES "programs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'commissions_leadId_fkey') THEN
    ALTER TABLE "commissions" ADD CONSTRAINT "commissions_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "leads"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'organizer_billing_profiles_organizerId_fkey') THEN
    ALTER TABLE "organizer_billing_profiles" ADD CONSTRAINT "organizer_billing_profiles_organizerId_fkey" FOREIGN KEY ("organizerId") REFERENCES "organizers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'organizer_contracts_organizerId_fkey') THEN
    ALTER TABLE "organizer_contracts" ADD CONSTRAINT "organizer_contracts_organizerId_fkey" FOREIGN KEY ("organizerId") REFERENCES "organizers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'billing_statements_organizerId_fkey') THEN
    ALTER TABLE "billing_statements" ADD CONSTRAINT "billing_statements_organizerId_fkey" FOREIGN KEY ("organizerId") REFERENCES "organizers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'billing_statement_lines_statementId_fkey') THEN
    ALTER TABLE "billing_statement_lines" ADD CONSTRAINT "billing_statement_lines_statementId_fkey" FOREIGN KEY ("statementId") REFERENCES "billing_statements"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'billing_statement_lines_commissionId_fkey') THEN
    ALTER TABLE "billing_statement_lines" ADD CONSTRAINT "billing_statement_lines_commissionId_fkey" FOREIGN KEY ("commissionId") REFERENCES "commissions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;
