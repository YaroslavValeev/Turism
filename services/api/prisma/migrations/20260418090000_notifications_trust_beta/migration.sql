-- Trust-safe beta: статус подписки, identityKey, подтверждение email, исходы доставок, код результата job.

ALTER TABLE "notification_subscriptions" ADD COLUMN "status" TEXT NOT NULL DEFAULT 'pending_confirmation';
UPDATE "notification_subscriptions" SET "status" = CASE WHEN "isActive" = true THEN 'active' ELSE 'unsubscribed' END;
ALTER TABLE "notification_subscriptions" DROP COLUMN "isActive";

ALTER TABLE "notification_subscriptions" ADD COLUMN "identityKey" TEXT;
UPDATE "notification_subscriptions" SET "identityKey" =
  CASE
    WHEN "channel" = 'email' AND "contactEmail" IS NOT NULL THEN
      'e:' || lower(trim("contactEmail")) || ':' || "type" || ':' || md5(coalesce("filters"::text, '{}'))
    WHEN "channel" = 'telegram' AND "telegramChatId" IS NOT NULL THEN
      'tg:' || trim("telegramChatId") || ':' || "type" || ':' || md5(coalesce("filters"::text, '{}'))
    ELSE 'legacy:' || "id" || ':' || md5(coalesce("filters"::text, '{}'))
  END;
ALTER TABLE "notification_subscriptions" ALTER COLUMN "identityKey" SET NOT NULL;
CREATE UNIQUE INDEX "notification_subscriptions_identityKey_key" ON "notification_subscriptions"("identityKey");

ALTER TABLE "notification_subscriptions" ADD COLUMN "confirmationToken" TEXT;
CREATE UNIQUE INDEX "notification_subscriptions_confirmationToken_key" ON "notification_subscriptions"("confirmationToken");

ALTER TABLE "notification_subscriptions" ADD COLUMN "confirmationSentAt" TIMESTAMP(3);

ALTER TABLE "notification_deliveries" ADD COLUMN "jobId" TEXT;
ALTER TABLE "notification_deliveries" ADD COLUMN "outcome" TEXT NOT NULL DEFAULT 'delivered';

ALTER TABLE "notification_jobs" ADD COLUMN "resultCode" TEXT;

CREATE INDEX "notification_deliveries_jobId_idx" ON "notification_deliveries"("jobId");
