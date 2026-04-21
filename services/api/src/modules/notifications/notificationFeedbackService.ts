import { Prisma } from "@prisma/client";
import type { PrismaClient } from "@prisma/client";
import type { Env } from "@mywave/config";
import { verifyNotificationFeedbackToken } from "./notificationFeedbackTokens";
import { notificationTokenSecret } from "./notificationTokens";
import type { NotificationFeedbackJwtPayload } from "./notificationFeedbackTokens";

async function findDeliveredRow(
  db: PrismaClient,
  payload: NotificationFeedbackJwtPayload,
): Promise<{ id: string; programId: string | null; subscriptionId: string | null } | null> {
  const row = await db.notificationDelivery.findFirst({
    where: {
      jobId: payload.j,
      subscriptionId: payload.s,
      dedupeKey: payload.d,
      programId: payload.p,
      eventType: payload.e,
      outcome: "delivered",
    },
    orderBy: { sentAt: "desc" },
    select: { id: true, programId: true, subscriptionId: true },
  });
  return row;
}

async function applyTwoNegativeUnsubscribe(db: PrismaClient, subscriptionId: string): Promise<boolean> {
  const lastTwo = await db.notificationFeedback.findMany({
    where: { delivery: { subscriptionId } },
    orderBy: { createdAt: "desc" },
    take: 2,
    select: { feedbackType: true },
  });
  if (lastTwo.length < 2) return false;
  if (lastTwo[0].feedbackType !== "negative" || lastTwo[1].feedbackType !== "negative") return false;
  await db.notificationSubscription.update({
    where: { id: subscriptionId },
    data: { status: "unsubscribed", confirmationToken: null },
  });
  return true;
}

export type SubmitFeedbackResult =
  | { ok: true; duplicate?: boolean; autoUnsubscribed?: boolean }
  | { ok: false; error: "invalid_token" | "delivery_not_found" | "feedback_mismatch" | "bad_feedback" };

/**
 * Сохраняет feedback по подписанному токену (JWT: job/subscription/program/event/dedupe + `f`: positive|negative).
 * Для GET из письма `bodyFeedback` не передаётся. Для POST передаётся `feedback` и должен совпадать с `f` в JWT.
 */
export async function submitNotificationFeedback(
  db: PrismaClient,
  env: Env,
  token: string,
  bodyFeedback?: string,
): Promise<SubmitFeedbackResult> {
  const secret = notificationTokenSecret(env);
  const payload = verifyNotificationFeedbackToken(secret, token);
  if (!payload) return { ok: false, error: "invalid_token" };

  if (bodyFeedback !== undefined) {
    if (bodyFeedback !== "positive" && bodyFeedback !== "negative") return { ok: false, error: "bad_feedback" };
    if (bodyFeedback !== payload.f) return { ok: false, error: "feedback_mismatch" };
  }

  const delivery = await findDeliveredRow(db, payload);
  if (!delivery?.subscriptionId) return { ok: false, error: "delivery_not_found" };

  try {
    await db.notificationFeedback.create({
      data: {
        deliveryId: delivery.id,
        programId: delivery.programId ?? payload.p,
        feedbackType: payload.f,
      },
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return { ok: true, duplicate: true };
    }
    throw e;
  }

  let autoUnsubscribed = false;
  if (payload.f === "negative") {
    autoUnsubscribed = await applyTwoNegativeUnsubscribe(db, delivery.subscriptionId);
  }

  return { ok: true, autoUnsubscribed };
}
