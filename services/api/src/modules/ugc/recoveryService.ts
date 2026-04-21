/**
 * Reward recovery при cancel/refund-переходах.
 *
 * Policy (trust-retention, не growth):
 *  - если у booking есть appliedRewardId и он не дошёл до `completed`, reward
 *    возвращается в `available` — гость не теряет свой один-shot.
 *  - если cancellationKind ∈ {no_show, fraud} — reward НЕ возвращается.
 *  - если booking уже был `completed` (refund_done после completion) — reward
 *    честно отработал, не возвращаем.
 *  - idempotent: повторный вызов не повторяет возврат.
 *  - safety: reward возвращается только если привязан к ЭТОМУ booking.
 */

import type { Env } from "@mywave/config";
import type { PrismaClient } from "@prisma/client";
import { writeAuditLog } from "../../lib/audit";
import { sendRewardRecoveredEmail } from "./rewardService";

export type CancellationKind =
  | "organizer_cancelled"
  | "platform_cancelled"
  | "user_cancelled"
  | "no_show"
  | "fraud"
  | "other";

export const CANCELLATION_KINDS: readonly CancellationKind[] = [
  "organizer_cancelled",
  "platform_cancelled",
  "user_cancelled",
  "no_show",
  "fraud",
  "other",
] as const;

export function isCancellationKind(v: unknown): v is CancellationKind {
  return typeof v === "string" && (CANCELLATION_KINDS as readonly string[]).includes(v);
}

/** Причины, при которых recovery НЕ производится (гость сам виноват). */
const NON_RECOVERABLE_KINDS: ReadonlySet<CancellationKind> = new Set(["no_show", "fraud"]);

/** Статусы, при переходе в которые триггерится попытка recovery. */
export const RECOVERY_TRIGGER_STATUSES = new Set([
  "cancelled_user",
  "cancelled_organizer",
  "refund_done",
]);

export type RecoveryResult =
  | {
      recovered: true;
      rewardId: string;
      cancellationKind: CancellationKind | null;
    }
  | {
      recovered: false;
      reason:
        | "no_applied_reward"
        | "was_completed"
        | "policy_no_show"
        | "policy_fraud"
        | "reward_missing"
        | "already_available"
        | "bound_to_other_booking"
        | "race_or_changed";
    };

export async function recoverRewardOnCancellation(
  prisma: PrismaClient,
  params: {
    bookingId: string;
    cancellationKind: CancellationKind | null;
    actorId: string | null;
    env?: Env;
  },
): Promise<RecoveryResult> {
  const booking = await prisma.booking.findUnique({
    where: { id: params.bookingId },
    select: {
      id: true,
      appliedRewardId: true,
      completedAt: true,
    },
  });
  if (!booking || !booking.appliedRewardId) {
    return { recovered: false, reason: "no_applied_reward" };
  }
  if (booking.completedAt) {
    // Booking дошёл до completed раньше → reward отработал честно.
    return { recovered: false, reason: "was_completed" };
  }
  // Гость сам виноват → reward не возвращаем.
  if (params.cancellationKind && NON_RECOVERABLE_KINDS.has(params.cancellationKind)) {
    if (params.cancellationKind === "no_show") return { recovered: false, reason: "policy_no_show" };
    if (params.cancellationKind === "fraud") return { recovered: false, reason: "policy_fraud" };
  }

  const reward = await prisma.userReward.findUnique({ where: { id: booking.appliedRewardId } });
  if (!reward) {
    return { recovered: false, reason: "reward_missing" };
  }
  if (reward.status === "available") {
    return { recovered: false, reason: "already_available" };
  }
  if (reward.usedBookingId && reward.usedBookingId !== booking.id) {
    // Защитный кейс: reward уже привязан к другому booking — не трогаем.
    return { recovered: false, reason: "bound_to_other_booking" };
  }

  // Атомарный возврат: match только если всё ещё used + привязан к этому booking.
  const res = await prisma.userReward.updateMany({
    where: {
      id: reward.id,
      status: "used",
      usedBookingId: booking.id,
    },
    data: {
      status: "available",
      usedBookingId: null,
      usedAt: null,
      recoveredAt: new Date(),
      recoveredCancellationKind: params.cancellationKind ?? null,
    },
  });
  if (res.count === 0) {
    return { recovered: false, reason: "race_or_changed" };
  }

  await writeAuditLog({
    entityType: "user_reward",
    entityId: reward.id,
    changedField: "status",
    oldValue: "used",
    newValue: "available",
    changedBy: params.actorId,
    reason: `reward recovered on cancel (kind=${params.cancellationKind ?? "unknown"}, bookingId=${booking.id})`,
  });

  await writeAuditLog({
    entityType: "booking",
    entityId: booking.id,
    changedField: "rewardRecovered",
    oldValue: reward.id,
    newValue: JSON.stringify({
      rewardId: reward.id,
      cancellationKind: params.cancellationKind ?? null,
    }),
    changedBy: params.actorId,
    reason: "reward recovery lifecycle event",
  });

  // Best-effort email «Ваш бонус восстановлен» — не валит recovery, если канал упал.
  if (params.env) {
    try {
      const refreshed = await prisma.userReward.findUnique({
        where: { id: reward.id },
        select: { email: true, userId: true },
      });
      if (refreshed?.email) {
        await sendRewardRecoveredEmail(params.env, refreshed.email, {
          authorName: null,
          cancellationKind: params.cancellationKind ?? null,
          userId: refreshed.userId,
        });
      }
    } catch {
      // ignore: уведомление best-effort
    }
  }

  return { recovered: true, rewardId: reward.id, cancellationKind: params.cancellationKind ?? null };
}
