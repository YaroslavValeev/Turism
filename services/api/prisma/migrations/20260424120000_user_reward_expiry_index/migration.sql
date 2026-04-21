-- Для выборки expiry job: status + expiresAt
CREATE INDEX "user_rewards_status_expires_at_idx" ON "user_rewards" ("status", "expiresAt");
