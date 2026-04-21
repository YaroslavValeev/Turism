import { emitBackendAnalyticsEventBestEffort } from "../analytics/service";

/**
 * Дублирует наблюдаемость доменного `commission_transition_violation_detected` в analytics pipeline
 * (best-effort, не ломает critical path). ADR-008 Stage 4.1 soft-mode.
 */
export function emitCommissionPolicyViolationAnalyticsBestEffort(params: {
  commissionId: string;
  organizerId?: string | null;
  programId?: string | null;
  bookingId?: string | null;
  fromStatus: string | null;
  toStatus: string | null;
  source: "admin" | "billing";
  billingKind?: "recalculate" | "statement_invoiced";
  idempotencySuffix?: string;
}) {
  const key = `commission_policy_violation:${params.commissionId}:${params.fromStatus ?? ""}:${params.toStatus ?? ""}:${params.billingKind ?? params.source}:${params.idempotencySuffix ?? "1"}`;
  emitBackendAnalyticsEventBestEffort({
    event_name: "commission_transition_violation_detected",
    event_version: 1,
    event_source: "backend",
    event_time: new Date().toISOString(),
    idempotency_key: key.slice(0, 500),
    organizer_id: params.organizerId ?? undefined,
    program_id: params.programId ?? undefined,
    booking_id: params.bookingId ?? undefined,
    commission_id: params.commissionId,
    properties_json: {
      from_status: params.fromStatus,
      to_status: params.toStatus,
      violation_source: params.source,
      billing_kind: params.billingKind ?? null,
    },
  });
}
