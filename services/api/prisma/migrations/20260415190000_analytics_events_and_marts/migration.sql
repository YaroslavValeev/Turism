-- Analytics event store + MVP marts (Founder + Billing)
-- Notes:
-- - Materialized views are refreshed NON-concurrently (compatible with Prisma migrations).
-- - Application layer must enforce non-PII payloads (see docs/analytics/PRIVACY_AND_CONSENT.md).

CREATE TABLE IF NOT EXISTS "analytics_events" (
  "id" TEXT NOT NULL,
  "eventName" TEXT NOT NULL,
  "eventVersion" INTEGER NOT NULL DEFAULT 1,
  "eventSource" TEXT NOT NULL,
  "eventTime" TIMESTAMP(3) NOT NULL,
  "ingestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "idempotencyKey" TEXT NOT NULL,

  "traceId" TEXT,
  "sessionId" TEXT,
  "userIdHash" TEXT,
  "userRole" TEXT,
  "pageType" TEXT,

  "programId" TEXT,
  "organizerId" TEXT,
  "discipline" TEXT,
  "region" TEXT,
  "verifiedStatus" TEXT,
  "trafficSource" TEXT,

  "leadId" TEXT,
  "bookingId" TEXT,
  "statementId" TEXT,
  "paymentId" TEXT,
  "refundId" TEXT,
  "commissionId" TEXT,

  "contractVersion" TEXT,
  "paymentStatus" TEXT,

  "grossAmount" INTEGER,
  "netAmount" INTEGER,
  "refundAmount" INTEGER,
  "commissionRate" INTEGER,
  "commissionAmount" INTEGER,

  "propertiesJson" JSONB,
  "schemaValid" BOOLEAN NOT NULL DEFAULT TRUE,
  "piiFlag" BOOLEAN NOT NULL DEFAULT FALSE,

  CONSTRAINT "analytics_events_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "analytics_events_idempotencyKey_key" ON "analytics_events"("idempotencyKey");
CREATE INDEX IF NOT EXISTS "analytics_events_eventTime_idx" ON "analytics_events"("eventTime");
CREATE INDEX IF NOT EXISTS "analytics_events_eventName_eventTime_idx" ON "analytics_events"("eventName", "eventTime");
CREATE INDEX IF NOT EXISTS "analytics_events_organizerId_eventTime_idx" ON "analytics_events"("organizerId", "eventTime");
CREATE INDEX IF NOT EXISTS "analytics_events_bookingId_eventTime_idx" ON "analytics_events"("bookingId", "eventTime");

CREATE TABLE IF NOT EXISTS "analytics_event_errors" (
  "id" TEXT NOT NULL,
  "idempotencyKey" TEXT,
  "eventName" TEXT,
  "reasonCode" TEXT NOT NULL,
  "message" TEXT NOT NULL,
  "rawPayload" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "analytics_event_errors_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "analytics_event_errors_createdAt_idx" ON "analytics_event_errors"("createdAt");
CREATE INDEX IF NOT EXISTS "analytics_event_errors_reasonCode_idx" ON "analytics_event_errors"("reasonCode");

-- Founder mart (daily grain)
DROP MATERIALIZED VIEW IF EXISTS "mv_founder_daily";
CREATE MATERIALIZED VIEW "mv_founder_daily" AS
WITH all_days AS (
  SELECT date_trunc('day', b."updatedAt") AS day FROM "bookings" b
  UNION
  SELECT date_trunc('day', o."createdAt") AS day FROM "organizers" o
  UNION
  SELECT date_trunc('day', l."createdAt") AS day FROM "leads" l
  UNION
  SELECT date_trunc('day', p."createdAt") AS day FROM "programs" p
  UNION
  SELECT date_trunc('day', c."updatedAt") AS day FROM "commissions" c
  UNION
  SELECT date_trunc('day', i."createdAt") AS day FROM "incidents" i
  UNION
  SELECT date_trunc('day', r."createdAt") AS day FROM "reviews" r
),
days AS (
  SELECT DISTINCT day FROM all_days WHERE day IS NOT NULL
)
SELECT
  d.day::date AS day,

  (
    SELECT COUNT(*)::integer
    FROM "bookings" b
    JOIN "organizers" o ON o."id" = b."organizerId"
    WHERE date_trunc('day', b."updatedAt") = d.day
      AND b."bookingStatus" IN ('completed', 'paid_full')
      AND o."verificationStatus" IN ('verified', 'trusted_by_platform')
  ) AS nsm_core,

  (
    SELECT COUNT(*)::integer
    FROM "bookings" b
    JOIN "organizers" o ON o."id" = b."organizerId"
    WHERE date_trunc('day', b."updatedAt") = d.day
      AND b."bookingStatus" IN ('booked', 'paid_partial')
      AND o."verificationStatus" IN ('verified', 'trusted_by_platform')
  ) AS nsm_extended,

  (
    SELECT COUNT(DISTINCT b."organizerId")::integer
    FROM "bookings" b
    JOIN "organizers" o ON o."id" = b."organizerId"
    WHERE date_trunc('day', b."updatedAt") = d.day
      AND o."verificationStatus" IN ('verified', 'trusted_by_platform')
  ) AS active_verified_organizers_distinct_booking_day,

  (
    SELECT COUNT(*)::integer
    FROM "programs" pr
    WHERE pr."publishStatus" = 'published'
      AND pr."createdAt" < (d.day + interval '1 day')
  ) AS active_programs_published_asof_day,

  (
    SELECT COUNT(*)::integer
    FROM "leads" l
    WHERE date_trunc('day', l."createdAt") = d.day
  ) AS leads_created,

  (
    SELECT COUNT(*)::integer
    FROM "organizers" o
    WHERE date_trunc('day', o."createdAt") = d.day
  ) AS new_organizers_created,

  (
    SELECT COUNT(*)::integer
    FROM "organizers" o
    WHERE date_trunc('day', o."updatedAt") = d.day
      AND o."verificationStatus" = 'verified'
  ) AS verified_organizers_updated_day,

  (
    SELECT COUNT(*)::integer
    FROM "organizers" o
    WHERE date_trunc('day', o."updatedAt") = d.day
      AND o."verificationStatus" = 'trusted_by_platform'
  ) AS trusted_organizers_updated_day,

  (
    SELECT COUNT(*)::integer
    FROM "bookings" b
    WHERE date_trunc('day', b."updatedAt") = d.day
      AND b."bookingStatus" = 'booked'
  ) AS bookings_booked,

  (
    SELECT COUNT(*)::integer
    FROM "bookings" b
    WHERE date_trunc('day', b."updatedAt") = d.day
      AND b."bookingStatus" IN ('paid_partial', 'paid_full', 'paid_off_platform')
  ) AS bookings_paid_any,

  (
    SELECT COUNT(*)::integer
    FROM "bookings" b
    WHERE date_trunc('day', b."updatedAt") = d.day
      AND b."paidAmountRub" > 0
  ) AS bookings_with_payment,

  (
    SELECT COUNT(*)::integer
    FROM "bookings" b
    WHERE date_trunc('day', b."updatedAt") = d.day
      AND b."bookingStatus" = 'completed'
  ) AS bookings_completed,

  (
    SELECT COALESCE(SUM(b."netAmountRub"), 0)::bigint
    FROM "bookings" b
    WHERE date_trunc('day', b."updatedAt") = d.day
  ) AS net_gmv_rub,

  (
    SELECT COALESCE(SUM(c."commissionAmountRub"), 0)::bigint
    FROM "commissions" c
    WHERE date_trunc('day', c."updatedAt") = d.day
      AND c."reconciliationStatus" = 'paid'
  ) AS commission_paid_rub,

  (
    SELECT COUNT(*)::integer
    FROM "incidents" i
    WHERE date_trunc('day', i."createdAt") = d.day
  ) AS complaints_created,

  (
    SELECT CASE
      WHEN bookings_cnt = 0 THEN NULL
      ELSE (complaints_cnt::double precision * 100.0 / bookings_cnt::double precision)
    END
    FROM (
      SELECT
        (SELECT COUNT(*)::integer FROM "incidents" i WHERE date_trunc('day', i."createdAt") = d.day) AS complaints_cnt,
        (SELECT COUNT(*)::integer FROM "bookings" b WHERE date_trunc('day', b."updatedAt") = d.day) AS bookings_cnt
    ) x
  ) AS complaint_rate_per_100_bookings,

  (
    SELECT AVG(r."rating")::double precision
    FROM "reviews" r
    WHERE date_trunc('day', r."createdAt") = d.day
      AND r."moderationStatus" = 'approved'
  ) AS avg_rating_approved

FROM days d
ORDER BY d.day DESC;

CREATE UNIQUE INDEX IF NOT EXISTS "mv_founder_daily_day_uidx" ON "mv_founder_daily"("day");

-- Billing mart (daily grain, per organizer)
DROP MATERIALIZED VIEW IF EXISTS "mv_billing_daily";
CREATE MATERIALIZED VIEW "mv_billing_daily" AS
WITH keys AS (
  SELECT date_trunc('day', p."paidAt") AS day, p."organizerId" AS organizer_id FROM "payments" p
  UNION
  SELECT date_trunc('day', r."refundedAt") AS day, r."organizerId" AS organizer_id FROM "refunds" r
  UNION
  SELECT date_trunc('day', c."updatedAt") AS day, c."organizerId" AS organizer_id FROM "commissions" c
)
SELECT
  k.day::date AS day,
  k.organizer_id AS "organizerId",

  (
    SELECT COALESCE(SUM(p."amountRub"), 0)::bigint
    FROM "payments" p
    WHERE date_trunc('day', p."paidAt") = k.day
      AND p."organizerId" = k.organizer_id
  ) AS payments_amount_rub,

  (
    SELECT COUNT(*)::integer
    FROM "payments" p
    WHERE date_trunc('day', p."paidAt") = k.day
      AND p."organizerId" = k.organizer_id
  ) AS payments_count,

  (
    SELECT COALESCE(SUM(r."amountRub"), 0)::bigint
    FROM "refunds" r
    WHERE date_trunc('day', r."refundedAt") = k.day
      AND r."organizerId" = k.organizer_id
  ) AS refunds_amount_rub,

  (
    SELECT COUNT(*)::integer
    FROM "refunds" r
    WHERE date_trunc('day', r."refundedAt") = k.day
      AND r."organizerId" = k.organizer_id
  ) AS refunds_count,

  (
    SELECT COALESCE(SUM(c."commissionAmountRub"), 0)::bigint
    FROM "commissions" c
    WHERE date_trunc('day', c."updatedAt") = k.day
      AND c."organizerId" = k.organizer_id
      AND c."reconciliationStatus" = 'accrued'
  ) AS commissions_accrued_rub,

  (
    SELECT COUNT(*)::integer
    FROM "commissions" c
    WHERE date_trunc('day', c."updatedAt") = k.day
      AND c."organizerId" = k.organizer_id
      AND c."reconciliationStatus" = 'accrued'
  ) AS commissions_accrued_count,

  (
    SELECT COALESCE(SUM(c."commissionAmountRub"), 0)::bigint
    FROM "commissions" c
    WHERE date_trunc('day', c."updatedAt") = k.day
      AND c."organizerId" = k.organizer_id
      AND c."reconciliationStatus" = 'approved'
  ) AS commissions_approved_rub,

  (
    SELECT COUNT(*)::integer
    FROM "commissions" c
    WHERE date_trunc('day', c."updatedAt") = k.day
      AND c."organizerId" = k.organizer_id
      AND c."reconciliationStatus" = 'approved'
  ) AS commissions_approved_count,

  (
    SELECT COALESCE(SUM(c."commissionAmountRub"), 0)::bigint
    FROM "commissions" c
    WHERE date_trunc('day', c."updatedAt") = k.day
      AND c."organizerId" = k.organizer_id
      AND c."reconciliationStatus" = 'invoiced'
  ) AS commissions_invoiced_rub,

  (
    SELECT COUNT(*)::integer
    FROM "commissions" c
    WHERE date_trunc('day', c."updatedAt") = k.day
      AND c."organizerId" = k.organizer_id
      AND c."reconciliationStatus" = 'invoiced'
  ) AS commissions_invoiced_count,

  (
    SELECT COALESCE(SUM(c."commissionAmountRub"), 0)::bigint
    FROM "commissions" c
    WHERE date_trunc('day', c."updatedAt") = k.day
      AND c."organizerId" = k.organizer_id
      AND c."reconciliationStatus" = 'paid'
  ) AS commissions_paid_rub,

  (
    SELECT COUNT(*)::integer
    FROM "commissions" c
    WHERE date_trunc('day', c."updatedAt") = k.day
      AND c."organizerId" = k.organizer_id
      AND c."reconciliationStatus" = 'paid'
  ) AS commissions_paid_count,

  (
    SELECT COALESCE(SUM(c."commissionAmountRub"), 0)::bigint
    FROM "commissions" c
    WHERE date_trunc('day', c."updatedAt") = k.day
      AND c."organizerId" = k.organizer_id
      AND c."reconciliationStatus" = 'reversed'
  ) AS commissions_reversed_rub,

  (
    SELECT COUNT(*)::integer
    FROM "commissions" c
    WHERE date_trunc('day', c."updatedAt") = k.day
      AND c."organizerId" = k.organizer_id
      AND c."reconciliationStatus" = 'reversed'
  ) AS commissions_reversed_count,

  (
    SELECT COALESCE(SUM(c."commissionAmountRub"), 0)::bigint
    FROM "commissions" c
    WHERE date_trunc('day', c."updatedAt") = k.day
      AND c."organizerId" = k.organizer_id
      AND c."reconciliationStatus" = 'disputed'
  ) AS commissions_disputed_rub,

  (
    SELECT COUNT(*)::integer
    FROM "commissions" c
    WHERE date_trunc('day', c."updatedAt") = k.day
      AND c."organizerId" = k.organizer_id
      AND c."reconciliationStatus" = 'disputed'
  ) AS commissions_disputed_count

FROM keys k
ORDER BY k.day DESC;

CREATE UNIQUE INDEX IF NOT EXISTS "mv_billing_daily_day_org_uidx" ON "mv_billing_daily"("day", "organizerId");

CREATE OR REPLACE FUNCTION analytics_refresh_marts()
RETURNS void AS $$
BEGIN
  REFRESH MATERIALIZED VIEW "mv_founder_daily";
  REFRESH MATERIALIZED VIEW "mv_billing_daily";
END;
$$ LANGUAGE plpgsql;

-- Dedup/cooldown storage for alert engine (MVP)
CREATE TABLE IF NOT EXISTS "analytics_alert_state" (
  "alertKey" TEXT NOT NULL,
  "lastFiredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastFingerprint" TEXT,
  CONSTRAINT "analytics_alert_state_pkey" PRIMARY KEY ("alertKey")
);
