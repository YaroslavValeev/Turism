import { isCommissionReconciliationStatus } from "@mywave/shared-types";
import { isValidCommissionReconciliationTransition } from "@mywave/shared-policy";
import type { PrismaClient } from "@prisma/client";
import { writeAuditLog } from "../../lib/audit";
import { emitCommissionPolicyViolationAnalyticsBestEffort } from "./emitCommissionPolicyViolationAnalytics";
import { recordCommissionTransitionViolationDetected } from "./recordCommissionTransitionViolation";
import { recordDomainStatusEvent } from "./recordDomainStatusEvent";
import type { TransitionActor } from "./types";
import type { TriggerMode } from "./types";

function commissionReconciliationEventType(to: string): string {
  if (to === "invoiced") return "invoice_issued";
  if (to === "paid") return "invoice_paid";
  return "commission_reconciliation_transition";
}

export async function applyCommissionReconciliationPatch(params: {
  prisma: PrismaClient;
  commissionId: string;
  body: {
    reconciliationStatus?: string;
    commissionCollectedRub?: number;
    invoiceStatus?: string;
    paymentReceivedDate?: string;
  };
  actor: TransitionActor;
  triggerMode: TriggerMode;
  idempotencyKey?: string | null;
  source?: string | null;
  /** Stage 4.1: по умолчанию false — нарушение зон логируется и событие, без 400. */
  strictMode?: boolean;
}) {
  const { prisma, commissionId, body, actor, triggerMode, idempotencyKey, source } = params;
  const strictMode = params.strictMode === true;
  const existing = await prisma.commission.findUnique({ where: { id: commissionId } });
  if (!existing) return { ok: false as const, error: "not_found" as const };

  const reconciliationStatus =
    body.reconciliationStatus && isCommissionReconciliationStatus(body.reconciliationStatus)
      ? body.reconciliationStatus
      : undefined;
  const data: {
    reconciliationStatus?: string;
    commissionCollectedRub?: number | null;
    invoiceStatus?: string | null;
    paymentReceivedDate?: Date | null;
  } = {};

  let softViolation: { from: string; to: string } | null = null;

  if (reconciliationStatus) {
    const valid = isValidCommissionReconciliationTransition(existing.reconciliationStatus, reconciliationStatus);
    if (!valid) {
      if (strictMode) {
        return {
          ok: false as const,
          error: "invalid_transition" as const,
          from: existing.reconciliationStatus,
          to: reconciliationStatus,
        };
      }
      softViolation = { from: existing.reconciliationStatus, to: reconciliationStatus };
    }
    data.reconciliationStatus = reconciliationStatus;
  }
  if (body.commissionCollectedRub != null) data.commissionCollectedRub = body.commissionCollectedRub;
  if (body.invoiceStatus !== undefined) data.invoiceStatus = body.invoiceStatus || null;
  if (body.paymentReceivedDate !== undefined) {
    data.paymentReceivedDate = body.paymentReceivedDate ? new Date(body.paymentReceivedDate) : null;
  }
  if (Object.keys(data).length === 0) {
    return { ok: false as const, error: "no_valid_fields" as const };
  }

  if (reconciliationStatus && idempotencyKey) {
    const prior = await prisma.domainStatusEvent.findUnique({ where: { idempotencyKey } });
    if (prior) {
      const c = await prisma.commission.findUnique({
        where: { id: commissionId },
        include: { booking: { select: { id: true } }, organizer: { select: { displayName: true } }, program: { select: { title: true } } },
      });
      if (!c) return { ok: false as const, error: "not_found" as const };
      return { ok: true as const, commission: c, replayed: true as const, transitionViolationObserved: false as const };
    }
  }

  const c = await prisma.commission.update({
    where: { id: commissionId },
    data,
    include: { booking: { select: { id: true } }, organizer: { select: { displayName: true } }, program: { select: { title: true } } },
  });

  if (reconciliationStatus && existing.reconciliationStatus !== reconciliationStatus) {
    if (softViolation) {
      console.warn("[commission] reconciliation transition would fail strict policy; soft-allowed", softViolation);
      await recordCommissionTransitionViolationDetected(prisma, {
        commissionId: c.id,
        fromStatus: softViolation.from,
        toStatus: softViolation.to,
        reason: "zone_policy_violation_soft_allow",
        actorId: actor.actorId,
        actorMarker: actor.actorMarker ?? null,
        source: "admin",
        triggerMode,
      });
      emitCommissionPolicyViolationAnalyticsBestEffort({
        commissionId: c.id,
        organizerId: c.organizerId,
        programId: c.programId,
        bookingId: c.bookingId,
        fromStatus: softViolation.from,
        toStatus: softViolation.to,
        source: "admin",
        idempotencySuffix: idempotencyKey ?? undefined,
      });
    }

    await recordDomainStatusEvent(prisma, {
      eventType: commissionReconciliationEventType(reconciliationStatus),
      entityType: "commission",
      entityId: c.id,
      fromStatus: existing.reconciliationStatus,
      toStatus: reconciliationStatus,
      triggerMode,
      actorId: actor.actorId,
      actorMarker: actor.actorMarker ?? null,
      source: source ?? "PATCH /commissions/:id/reconciliation",
      payloadJson: {
        invoiceStatus: c.invoiceStatus,
        commissionCollectedRub: c.commissionCollectedRub,
        softViolation: softViolation != null,
      },
      idempotencyKey: idempotencyKey ?? null,
    });
    await writeAuditLog({
      entityType: "commission",
      entityId: c.id,
      changedField: "commission_reconciliation_change",
      oldValue: existing.reconciliationStatus,
      newValue: c.reconciliationStatus,
      changedBy: actor.actorId,
      reason: softViolation ? "reconciliation update (policy violation soft-allowed)" : "reconciliation update",
    });
  }

  return {
    ok: true as const,
    commission: c,
    replayed: false as const,
    transitionViolationObserved: softViolation != null,
  };
}
