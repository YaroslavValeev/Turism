-- Feedback на уведомления (email one-click + API).

CREATE TABLE "notification_feedback" (
    "id" TEXT NOT NULL,
    "deliveryId" TEXT NOT NULL,
    "programId" TEXT,
    "feedbackType" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notification_feedback_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "notification_feedback_deliveryId_key" ON "notification_feedback"("deliveryId");

ALTER TABLE "notification_feedback" ADD CONSTRAINT "notification_feedback_deliveryId_fkey" FOREIGN KEY ("deliveryId") REFERENCES "notification_deliveries"("id") ON DELETE CASCADE ON UPDATE CASCADE;
