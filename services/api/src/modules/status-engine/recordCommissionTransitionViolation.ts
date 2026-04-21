import type { PrismaClient } from "@prisma/client";
import { recordDomainStatusEvent } from "./recordDomainStatusEvent";
import type { TriggerMode } from "./types";

export type CommissionViolationSource = "admin" | "billing";

/**
 * Доменное событие: переход комиссии не прошёл бы policy в strict-режиме, но разрешён soft-режимом
 * или зафиксирован на billing critical path без прерывания (ADR Stage 4.1).
 */
export async function recordCommissionTransitionViolationDetected(
  prisma: PrismaClient,
  params: {
    commissionId: string;
    fromStatus: string | null;
    toStatus: string | null;
    reason: string;
    actorId: string | null;
    actorMarker?: string | null;
    source: CommissionViolationSource;
    billingKind?: "recalculate" | "statement_invoiced";
    triggerMode: TriggerMode;
  },
) {
  const sourceLabel =
    params.source === "billing"
      ? `billing:${params.billingKind ?? "unknown"}`
      : "admin:PATCH";

  return recordDomainStatusEvent(prisma, {
    eventType: "commission_transition_violation_detected",
    entityType: "commission",
    entityId: params.commissionId,
    fromStatus: params.fromStatus,
    toStatus: params.toStatus,
    triggerMode: params.triggerMode,
    actorId: params.actorId,
    actorMarker: params.actorMarker ?? null,
    source: sourceLabel,
    reason: params.reason,
    payloadJson: {
      from: params.fromStatus,
      to: params.toStatus,
      reason: params.reason,
      actorId: params.actorId,
      source: params.source,
      billingKind: params.billingKind ?? null,
    },
  });
}
