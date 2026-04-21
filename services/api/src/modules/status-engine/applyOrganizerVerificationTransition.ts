import { isOrganizerVerificationStatus, type OrganizerVerificationStatus } from "@mywave/shared-types";
import { isValidOrganizerVerificationTransition } from "@mywave/shared-policy";
import type { PrismaClient } from "@prisma/client";
import { writeAuditLog } from "../../lib/audit";
import { emitBackendAnalyticsEventBestEffort } from "../analytics/service";
import { recordDomainStatusEvent } from "./recordDomainStatusEvent";
import { organizerVerificationDomainEventType } from "./organizerVerificationEventType";
import type { TransitionActor } from "./types";
import type { TriggerMode } from "./types";

export async function applyOrganizerVerificationTransition(params: {
  prisma: PrismaClient;
  organizerId: string;
  toStatus: string;
  actor: TransitionActor;
  triggerMode: TriggerMode;
  idempotencyKey?: string | null;
  source?: string | null;
}) {
  const { prisma, organizerId, toStatus, actor, triggerMode, idempotencyKey, source } = params;
  const existing = await prisma.organizer.findUnique({ where: { id: organizerId } });
  if (!existing) return { ok: false as const, error: "not_found" as const };
  if (!isOrganizerVerificationStatus(toStatus)) {
    return { ok: false as const, error: "invalid_status" as const };
  }
  const from = existing.verificationStatus;
  if (from === toStatus) {
    return { ok: true as const, organizer: existing, replayed: true as const };
  }
  if (!isValidOrganizerVerificationTransition(from, toStatus)) {
    return { ok: false as const, error: "invalid_transition" as const, from, to: toStatus };
  }
  if (idempotencyKey) {
    const prior = await prisma.domainStatusEvent.findUnique({ where: { idempotencyKey } });
    if (prior) {
      const again = await prisma.organizer.findUnique({ where: { id: organizerId } });
      if (!again) return { ok: false as const, error: "not_found" as const };
      return { ok: true as const, organizer: again, replayed: true as const };
    }
  }

  const o = await prisma.organizer.update({
    where: { id: organizerId },
    data: { verificationStatus: toStatus as OrganizerVerificationStatus },
  });

  await recordDomainStatusEvent(prisma, {
    eventType: organizerVerificationDomainEventType(toStatus),
    entityType: "organizer",
    entityId: o.id,
    fromStatus: from,
    toStatus,
    triggerMode,
    actorId: actor.actorId,
    actorMarker: actor.actorMarker ?? null,
    source: source ?? "PATCH /organizers/:id/verification-status",
    payloadJson: { from, to: toStatus },
    idempotencyKey: idempotencyKey ?? null,
  });

  await writeAuditLog({
    entityType: "organizer",
    entityId: o.id,
    changedField: "verification_status",
    oldValue: from,
    newValue: o.verificationStatus,
    changedBy: actor.actorId,
    reason: "verification status change",
  });

  if (o.verificationStatus === "verified") {
    emitBackendAnalyticsEventBestEffort({
      event_name: "organizer_verified",
      event_version: 1,
      event_source: "backend",
      event_time: new Date().toISOString(),
      idempotency_key: `organizer_verified:${o.id}`,
      organizer_id: o.id,
      verified_status: o.verificationStatus,
      properties_json: { from, to: toStatus },
    });
  }
  if (o.verificationStatus === "trusted_by_platform") {
    emitBackendAnalyticsEventBestEffort({
      event_name: "organizer_trusted",
      event_version: 1,
      event_source: "backend",
      event_time: new Date().toISOString(),
      idempotency_key: `organizer_trusted:${o.id}`,
      organizer_id: o.id,
      verified_status: o.verificationStatus,
      properties_json: { from, to: toStatus },
    });
  }

  return { ok: true as const, organizer: o, replayed: false as const };
}
