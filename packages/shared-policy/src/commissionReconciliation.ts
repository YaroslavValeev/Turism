import {
  COMMISSION_RECONCILIATION_STATUSES,
  isCommissionReconciliationStatus,
  type CommissionReconciliationStatus,
} from "@mywave/shared-types";

/**
 * Зоны для варианта B (ADR-008 Accepted): pre → pipe → settle, плюс exception.
 * Ручные переходы (PATCH) не покрывают весь граф; запрещён откат settlement → intake.
 */
type CommissionZone = "pre" | "pipe" | "settle" | "exc";

function zoneOf(s: CommissionReconciliationStatus): CommissionZone {
  switch (s) {
    case "draft":
    case "pending_evidence":
      return "pre";
    case "accrued":
    case "approved":
      return "pipe";
    case "invoiced":
    case "partially_paid":
    case "paid":
      return "settle";
    default:
      return "exc";
  }
}

/** Ручной (admin) переход reconciliationStatus — зоны + явный запрет settle → pre. */
export function isValidCommissionManualReconciliationTransition(
  from: CommissionReconciliationStatus,
  to: CommissionReconciliationStatus,
): boolean {
  if (from === to) return true;
  const zf = zoneOf(from);
  const zt = zoneOf(to);
  if (zf === zt) return true;
  if (zf === "settle" && zt === "pre") return false;
  return true;
}

/**
 * Авто-контур billing: только допустимые цели для каждого вида операции.
 * Не смешивать с ручным графом (ADR-007/008: разделение контуров).
 */
export type CommissionBillingReconciliationKind = "recalculate" | "statement_invoiced";

export function isValidCommissionReconciliationBillingTransition(
  from: string,
  to: string,
  kind: CommissionBillingReconciliationKind,
): boolean {
  if (!isCommissionReconciliationStatus(to)) return false;
  if (!isCommissionReconciliationStatus(from)) return true;
  if (kind === "recalculate") {
    return to === "accrued" || to === "reversed" || to === "disputed";
  }
  if (kind === "statement_invoiced") {
    return to === "invoiced";
  }
  return false;
}

/**
 * Переходы reconciliationStatus для PATCH (admin).
 * Legacy `from` вне enum — разрешаем нормализацию в любой канонический `to`.
 */
export function isValidCommissionReconciliationTransition(from: string, to: string): boolean {
  if (!isCommissionReconciliationStatus(to)) return false;
  if (!isCommissionReconciliationStatus(from)) return true;
  return isValidCommissionManualReconciliationTransition(from, to);
}

export function getNextCommissionReconciliationStatuses(current: string): CommissionReconciliationStatus[] {
  if (!isCommissionReconciliationStatus(current)) {
    return [...COMMISSION_RECONCILIATION_STATUSES];
  }
  return COMMISSION_RECONCILIATION_STATUSES.filter(
    (s) => s !== current && isValidCommissionReconciliationTransition(current, s),
  );
}
