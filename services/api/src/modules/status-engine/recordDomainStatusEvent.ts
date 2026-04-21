import type { Prisma, PrismaClient } from "@prisma/client";
import type { TriggerMode } from "./types";

export type DbClient = PrismaClient | Prisma.TransactionClient;

export type RecordDomainStatusEventInput = {
  eventType: string;
  entityType: string;
  entityId: string;
  fromStatus: string | null;
  toStatus: string | null;
  triggerMode: TriggerMode;
  actorId: string | null;
  actorMarker?: string | null;
  reason?: string | null;
  source?: string | null;
  payloadJson?: Prisma.InputJsonValue;
  idempotencyKey?: string | null;
};

export async function recordDomainStatusEvent(db: DbClient, input: RecordDomainStatusEventInput) {
  if (input.idempotencyKey) {
    const existing = await db.domainStatusEvent.findUnique({
      where: { idempotencyKey: input.idempotencyKey },
    });
    if (existing) {
      return existing;
    }
  }
  try {
    return await db.domainStatusEvent.create({
      data: {
        eventType: input.eventType,
        entityType: input.entityType,
        entityId: input.entityId,
        fromStatus: input.fromStatus,
        toStatus: input.toStatus,
        triggerMode: input.triggerMode,
        actorId: input.actorId,
        actorMarker: input.actorMarker ?? null,
        reason: input.reason ?? null,
        source: input.source ?? null,
        payloadJson: input.payloadJson ?? undefined,
        idempotencyKey: input.idempotencyKey ?? null,
      },
    });
  } catch (e: unknown) {
    const code = typeof e === "object" && e && "code" in e ? (e as { code: string }).code : null;
    if (code === "P2002" && input.idempotencyKey) {
      return db.domainStatusEvent.findUnique({ where: { idempotencyKey: input.idempotencyKey } });
    }
    throw e;
  }
}
