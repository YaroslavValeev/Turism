import { isValidIntakeProcessingTransition } from "@mywave/shared-policy";
import type { PrismaClient } from "@prisma/client";
import { writeAuditLog } from "../../lib/audit";
import { recordDomainStatusEvent } from "./recordDomainStatusEvent";
import type { TransitionActor } from "./types";
import type { TriggerMode } from "./types";

export async function applyIntakeProcessingTransition(params: {
  prisma: PrismaClient;
  intakeId: string;
  toStatus: string;
  actor: TransitionActor;
  triggerMode: TriggerMode;
  note?: string | null;
  source?: string | null;
  idempotencyKey?: string | null;
}) {
  const { prisma, intakeId, toStatus, actor, triggerMode, note, source, idempotencyKey } = params;
  const row = await prisma.publicOrganizerIntake.findUnique({ where: { id: intakeId } });
  if (!row) return { ok: false as const, error: "not_found" as const };
  const from = row.processingStatus;
  if (from === toStatus) {
    return { ok: true as const, row, replayed: false as const };
  }
  if (!isValidIntakeProcessingTransition(from, toStatus)) {
    return { ok: false as const, error: "invalid_transition" as const, from, to: toStatus };
  }
  if (idempotencyKey) {
    const prior = await prisma.domainStatusEvent.findUnique({ where: { idempotencyKey } });
    if (prior) {
      const again = await prisma.publicOrganizerIntake.findUnique({ where: { id: intakeId } });
      if (!again) return { ok: false as const, error: "not_found" as const };
      return { ok: true as const, row: again, replayed: true as const };
    }
  }
  const updated = await prisma.publicOrganizerIntake.update({
    where: { id: intakeId },
    data: {
      processingStatus: toStatus,
      processedAt: new Date(),
      processedBy: actor.actorId,
    },
  });
  await recordDomainStatusEvent(prisma, {
    eventType: "intake_processed",
    entityType: "public_organizer_intake",
    entityId: updated.id,
    fromStatus: from,
    toStatus,
    triggerMode,
    actorId: actor.actorId,
    actorMarker: actor.actorMarker ?? null,
    reason: note ?? null,
    source: source ?? "PATCH /admin/organizer-intakes/:id/status",
    payloadJson: { note: note ?? null },
    idempotencyKey: idempotencyKey ?? null,
  });
  await writeAuditLog({
    entityType: "public_organizer_intake",
    entityId: updated.id,
    changedField: "processing_status",
    oldValue: from,
    newValue: toStatus,
    changedBy: actor.actorId,
    reason: note?.trim() || "admin intake status update",
  });
  return { ok: true as const, row: updated, replayed: false as const };
}
