CREATE TABLE "telegram_polling_state" (
  "id" TEXT NOT NULL,
  "nextOffset" BIGINT NOT NULL DEFAULT 0,
  "leaseOwner" TEXT,
  "leaseExpiresAt" TIMESTAMP(3),
  "lastReceivedAt" TIMESTAMP(3),
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "telegram_polling_state_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "telegram_polling_updates" (
  "updateId" BIGINT NOT NULL,
  "payload" JSONB,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "contentOk" BOOLEAN,
  "platformOk" BOOLEAN,
  "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "processedAt" TIMESTAMP(3),
  CONSTRAINT "telegram_polling_updates_pkey" PRIMARY KEY ("updateId")
);

CREATE INDEX "telegram_polling_updates_status_updateId_idx"
  ON "telegram_polling_updates"("status", "updateId");
