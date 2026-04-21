import type { Env } from "@mywave/config";
import { Prisma } from "@prisma/client";
import { Router, Response, Request } from "express";
import { prisma } from "../../lib/prisma";
import { requireAdmin } from "../../middleware/auth";

export function adminNotificationsRoutes(env: Env): Router {
  const router = Router();
  const admin = requireAdmin(env);

  router.get("/overview", admin, async (_req: Request, res: Response) => {
    const [
      pendingJobs,
      failedJobs,
      doneJobs,
      deliveredRows,
      skippedRate,
      skippedDup,
      failedDeliveries,
      outcomeUnsubscribed,
      outcomePendingConfirm,
      activeSubscriptions,
      pendingSubscriptions,
      unsubscribedCount,
    ] = await Promise.all([
      prisma.notificationJob.count({ where: { status: "pending" } }),
      prisma.notificationJob.count({ where: { status: "failed" } }),
      prisma.notificationJob.count({ where: { status: "done" } }),
      prisma.notificationDelivery.count({ where: { outcome: "delivered" } }),
      prisma.notificationDelivery.count({ where: { outcome: "skipped_rate_limited" } }),
      prisma.notificationDelivery.count({ where: { outcome: "skipped_duplicate" } }),
      prisma.notificationDelivery.count({ where: { outcome: "failed" } }),
      prisma.notificationDelivery.count({ where: { outcome: "unsubscribed" } }),
      prisma.notificationDelivery.count({ where: { outcome: "pending_confirmation" } }),
      prisma.notificationSubscription.count({ where: { status: "active" } }),
      prisma.notificationSubscription.count({ where: { status: "pending_confirmation" } }),
      prisma.notificationSubscription.count({ where: { status: "unsubscribed" } }),
    ]);

    const [feedbackPositive, feedbackNegative, feedbackByEventRows] = await Promise.all([
      prisma.notificationFeedback.count({ where: { feedbackType: "positive" } }),
      prisma.notificationFeedback.count({ where: { feedbackType: "negative" } }),
      prisma.$queryRaw<Array<{ eventType: string; feedbackType: string; n: bigint }>>(
        Prisma.sql`
          SELECT d."eventType" AS "eventType", f."feedbackType" AS "feedbackType", COUNT(*)::bigint AS n
          FROM "notification_feedback" f
          INNER JOIN "notification_deliveries" d ON d."id" = f."deliveryId"
          GROUP BY d."eventType", f."feedbackType"
        `,
      ),
    ]);

    const byEventType: Record<string, { positive: number; negative: number; positive_rate: number | null }> = {};
    for (const r of feedbackByEventRows) {
      if (!byEventType[r.eventType]) {
        byEventType[r.eventType] = { positive: 0, negative: 0, positive_rate: null };
      }
      const n = Number(r.n);
      if (r.feedbackType === "positive") byEventType[r.eventType].positive = n;
      else if (r.feedbackType === "negative") byEventType[r.eventType].negative = n;
    }
    for (const k of Object.keys(byEventType)) {
      const o = byEventType[k];
      const t = o.positive + o.negative;
      o.positive_rate = t === 0 ? null : Math.round((10000 * o.positive) / t) / 10000;
    }

    res.json({
      jobs: {
        pending: pendingJobs,
        failed: failedJobs,
        done: doneJobs,
      },
      deliveries: {
        delivered: deliveredRows,
        skipped_rate_limited: skippedRate,
        skipped_duplicate: skippedDup,
        failed: failedDeliveries,
        unsubscribed: outcomeUnsubscribed,
        pending_confirmation: outcomePendingConfirm,
      },
      subscriptions: {
        active: activeSubscriptions,
        pending_confirmation: pendingSubscriptions,
        unsubscribed: unsubscribedCount,
      },
      feedback: {
        positive: feedbackPositive,
        negative: feedbackNegative,
        total: feedbackPositive + feedbackNegative,
        by_event_type: byEventType,
      },
    });
  });

  return router;
}
