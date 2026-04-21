import type { ProgramPublishStatus } from "@mywave/shared-types";
import { isProgramPublishStatus } from "@mywave/shared-types";
import { isValidProgramPublishTransition, type ProgramPublishTransitionContext } from "@mywave/shared-policy";
import type { Program, ProgramMedia } from "@prisma/client";
import { writeAuditLog } from "../../lib/audit";
import { canPublish, type PublishGateMissingField } from "../programs/publishGate";
import { recordDomainStatusEvent, type DbClient } from "./recordDomainStatusEvent";
import { programPublishDomainEventType } from "./programPublishEventType";
import type { TransitionActor } from "./types";
import type { TriggerMode } from "./types";
import { initProgramConversionFunnelOnPublish } from "../conversion-funnel/onPublish";

export type ApplyProgramPublishTransitionParams = {
  db: DbClient;
  programId: string;
  toStatus: string;
  actor: TransitionActor;
  triggerMode: TriggerMode;
  reason?: string | null;
  source?: string | null;
  idempotencyKey?: string | null;
  payload?: Record<string, unknown>;
  /** Доп. контекст для policy (например ingestion auto-publish draft→published). */
  transitionContext?: ProgramPublishTransitionContext;
};

export type ProgramWithMedia = Program & { media: ProgramMedia[] };

export type ApplyProgramPublishTransitionResult =
  | { ok: true; program: ProgramWithMedia; replayed?: boolean }
  | {
      ok: false;
      error: string;
      missing?: string[];
      missingFields?: PublishGateMissingField[];
      from?: string;
      to?: string;
    };

export async function applyProgramPublishTransition(
  params: ApplyProgramPublishTransitionParams,
): Promise<ApplyProgramPublishTransitionResult> {
  const { db, programId, actor, triggerMode, reason, source, idempotencyKey, payload, transitionContext } = params;
  if (!isProgramPublishStatus(params.toStatus)) {
    return { ok: false, error: "invalid_publish_status" };
  }
  const toStatus = params.toStatus as ProgramPublishStatus;

  const existing = await db.program.findUnique({
    where: { id: programId },
    include: { media: true, organizer: { select: { verificationStatus: true } } },
  });
  if (!existing) {
    return { ok: false, error: "not_found" };
  }

  const fromStatus = existing.publishStatus;
  if (fromStatus === toStatus) {
    const unchanged = await db.program.findUnique({
      where: { id: programId },
      include: { media: true },
    });
    if (!unchanged) return { ok: false, error: "not_found" };
    return { ok: true, program: unchanged, replayed: true };
  }

  if (idempotencyKey) {
    const prior = await db.domainStatusEvent.findUnique({ where: { idempotencyKey } });
    if (prior) {
      const programRow = await db.program.findUnique({
        where: { id: programId },
        include: { media: true },
      });
      if (!programRow) return { ok: false, error: "not_found" };
      return { ok: true, program: programRow, replayed: true };
    }
  }

  if (!isValidProgramPublishTransition(fromStatus, toStatus, transitionContext)) {
    return { ok: false, error: "invalid_transition", from: fromStatus, to: toStatus };
  }

  if (toStatus === "published") {
    const gate = canPublish(existing);
    if (!gate.ok) {
      return {
        ok: false,
        error: "publish_gate_not_passed",
        missing: gate.missing,
        missingFields: gate.missingFields,
      };
    }
  }

  const program = await db.program.update({
    where: { id: programId },
    data: { publishStatus: toStatus },
    include: { media: true },
  });

  const eventType = programPublishDomainEventType(fromStatus, toStatus);
  await recordDomainStatusEvent(db, {
    eventType,
    entityType: "program",
    entityId: program.id,
    fromStatus,
    toStatus,
    triggerMode,
    actorId: actor.actorId,
    actorMarker: actor.actorMarker ?? null,
    reason: reason ?? null,
    source: source ?? "PATCH /programs/:id/publish-status",
    payloadJson: {
      ...(payload ?? {}),
      from: fromStatus,
      to: toStatus,
    },
    idempotencyKey: idempotencyKey ?? null,
  });

  await writeAuditLog(
    {
      entityType: "program",
      entityId: program.id,
      changedField: "publish_status_change",
      oldValue: fromStatus,
      newValue: program.publishStatus,
      changedBy: actor.actorId,
      reason: reason?.trim() || "publish workflow",
    },
    db,
  );

  if (toStatus === "published") {
    void initProgramConversionFunnelOnPublish(program.id).catch((err: unknown) => {
      console.error("[conversion-funnel] init on publish failed", err instanceof Error ? err.message : String(err));
    });
  }

  return { ok: true, program };
}
