-- Каркас канала MAX для подписок каталога (recipient id задаётся клиентом; доставка — после настройки MAX_* env).
ALTER TABLE "notification_subscriptions" ADD COLUMN "maxRecipientId" TEXT;
