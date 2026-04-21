import { isBookingStatus, isValidBookingTransition, getNextBookingStatuses } from "@mywave/shared-policy";
import type { PrismaClient } from "@prisma/client";
import { writeAuditLog } from "../../lib/audit";
import { emitBackendAnalyticsEventBestEffort } from "../analytics/service";
import { ensureReviewRequestForCompletedBooking } from "../reviews/reviewRequests";
import { ensureUgcRequestForCompletedBooking } from "../ugc/ugcService";
import {
  recoverRewardOnCancellation,
  RECOVERY_TRIGGER_STATUSES,
  isCancellationKind,
  type CancellationKind,
} from "../ugc/recoveryService";
import { loadEnv } from "@mywave/config";
import { recordDomainStatusEvent } from "./recordDomainStatusEvent";
import { bookingStatusDomainEventType } from "./bookingStatusEventType";
import type { TransitionActor } from "./types";
import type { TriggerMode } from "./types";

/** ADR-007 operational path: единственный модуль с `prisma.booking.update` для смены `bookingStatus` по графу `bookingTransitions`. */
export async function applyBookingStatusTransition(params: {
  prisma: PrismaClient;
  bookingId: string;
  toStatus: string;
  actor: TransitionActor;
  triggerMode: TriggerMode;
  reason?: string | null;
  source?: string | null;
  idempotencyKey?: string | null;
  cancellationKind?: string | null;
  cancellationReason?: string | null;
}) {
  const { prisma, bookingId, actor, triggerMode, reason, source, idempotencyKey } = params;
  const cancellationKind: CancellationKind | null = isCancellationKind(params.cancellationKind)
    ? params.cancellationKind
    : null;
  const cancellationReasonText =
    typeof params.cancellationReason === "string" && params.cancellationReason.trim()
      ? params.cancellationReason.trim().slice(0, 2000)
      : null;
  const toStatus = params.toStatus;
  const existing = await prisma.booking.findUnique({
    where: { id: bookingId },
    include: { program: { select: { title: true } }, organizer: { select: { displayName: true } } },
  });
  if (!existing) return { ok: false as const, error: "not_found" as const };
  if (!isBookingStatus(toStatus)) {
    return { ok: false as const, error: "invalid_status" as const };
  }
  const from = existing.bookingStatus;
  if (from === toStatus) {
    const nextStatuses = getNextBookingStatuses(existing.bookingStatus);
    return { ok: true as const, booking: existing, nextStatuses, replayed: false as const };
  }
  if (!isValidBookingTransition(from, toStatus)) {
    return { ok: false as const, error: "invalid_transition" as const, from, to: toStatus };
  }
  if (idempotencyKey) {
    const prior = await prisma.domainStatusEvent.findUnique({ where: { idempotencyKey } });
    if (prior) {
      const b = await prisma.booking.findUnique({
        where: { id: bookingId },
        include: { program: { select: { title: true } }, organizer: { select: { displayName: true } } },
      });
      if (!b) return { ok: false as const, error: "not_found" as const };
      return {
        ok: true as const,
        booking: b,
        nextStatuses: getNextBookingStatuses(b.bookingStatus),
        replayed: true as const,
      };
    }
  }

  // ADR-007: запись статуса только здесь (operational); billing-derived — см. `billing/service` + `deriveBookingStatus`.
  const data: {
    bookingStatus: string;
    firstResponseAt?: Date;
    bookedAt?: Date;
    completedAt?: Date;
    cancellationKind?: string | null;
    cancellationReason?: string | null;
  } = { bookingStatus: toStatus };
  if (toStatus === "contacted" || toStatus === "sent_to_organizer") data.firstResponseAt = new Date();
  if (toStatus === "booked") data.bookedAt = new Date();
  if (toStatus === "completed") data.completedAt = new Date();
  if (RECOVERY_TRIGGER_STATUSES.has(toStatus)) {
    if (cancellationKind) data.cancellationKind = cancellationKind;
    if (cancellationReasonText) data.cancellationReason = cancellationReasonText;
  }

  const b = await prisma.booking.update({
    where: { id: bookingId },
    data,
    include: { program: { select: { title: true } }, organizer: { select: { displayName: true } } },
  });
  const nextStatuses = getNextBookingStatuses(b.bookingStatus);

  const domainEventType = bookingStatusDomainEventType(from, toStatus);
  await recordDomainStatusEvent(prisma, {
    eventType: domainEventType,
    entityType: "booking",
    entityId: b.id,
    fromStatus: from,
    toStatus,
    triggerMode,
    actorId: actor.actorId,
    actorMarker: actor.actorMarker ?? null,
    reason: reason ?? null,
    source: source ?? "PATCH /bookings/:id/status",
    payloadJson: { from, to: toStatus },
    idempotencyKey: idempotencyKey ?? null,
  });

  await writeAuditLog({
    entityType: "booking",
    entityId: b.id,
    changedField: "booking_status_change",
    oldValue: from,
    newValue: b.bookingStatus,
    changedBy: actor.actorId,
    reason: reason?.trim() || "status update",
  });

  if (toStatus === "booked") {
    emitBackendAnalyticsEventBestEffort({
      event_name: "booking_confirmed",
      event_version: 1,
      event_source: "backend",
      event_time: new Date().toISOString(),
      idempotency_key: `booking_confirmed:${b.id}`,
      organizer_id: b.organizerId,
      program_id: b.programId,
      booking_id: b.id,
      properties_json: { from, to: toStatus },
    });
  }
  if (toStatus === "paid_partial" || toStatus === "paid_full" || toStatus === "paid_off_platform") {
    emitBackendAnalyticsEventBestEffort({
      event_name: "booking_confirmed",
      event_version: 1,
      event_source: "backend",
      event_time: new Date().toISOString(),
      idempotency_key: `booking_paid_state:${b.id}:${toStatus}`,
      organizer_id: b.organizerId,
      program_id: b.programId,
      booking_id: b.id,
      properties_json: { from, to: toStatus },
    });
  }
  if (toStatus === "cancelled_user" || toStatus === "cancelled_organizer") {
    emitBackendAnalyticsEventBestEffort({
      event_name: "booking_canceled",
      event_version: 1,
      event_source: "backend",
      event_time: new Date().toISOString(),
      idempotency_key: `booking_canceled:${b.id}:${toStatus}`,
      organizer_id: b.organizerId,
      program_id: b.programId,
      booking_id: b.id,
      properties_json: { from, to: toStatus },
    });
  }
  if (toStatus === "completed") {
    await ensureReviewRequestForCompletedBooking(b);
    await ensureUgcRequestForCompletedBooking(prisma, b);
  }

  // Reward recovery: при переходе в cancelled_* или refund_done возвращаем reward,
  // если booking не дошёл до completed и кind-кто не no_show/fraud. Идемпотентно.
  if (RECOVERY_TRIGGER_STATUSES.has(toStatus) && b.appliedRewardId) {
    await recoverRewardOnCancellation(prisma, {
      bookingId: b.id,
      cancellationKind,
      actorId: actor.actorId,
      env: loadEnv(),
    });
  }

  return { ok: true as const, booking: b, nextStatuses, replayed: false as const };
}
