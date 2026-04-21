-- Owner Telegram notify attempts (visibility in admin UI).
ALTER TABLE "conversion_message_drafts" ADD COLUMN "ownerNotifyLastAttemptAt" TIMESTAMP(3);
ALTER TABLE "conversion_message_drafts" ADD COLUMN "ownerNotifyLastError" VARCHAR(512);
