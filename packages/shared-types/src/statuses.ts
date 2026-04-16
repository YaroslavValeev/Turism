/**
 * Canonical status enums. Source of truth: canonical_status_models.md
 * Do not duplicate or extend without approval.
 */

export const BOOKING_STATUSES = [
  "created",
  "new",
  "reviewed",
  "sent_to_organizer",
  "contacted",
  "offer_sent",
  "booked",
  "paid_partial",
  "paid_full",
  "paid_off_platform",
  "completed",
  "canceled",
  "cancelled_user",
  "cancelled_organizer",
  "refunded_partial",
  "refunded_full",
  "refund_pending",
  "refund_done",
  "disputed",
] as const;

export type BookingStatus = (typeof BOOKING_STATUSES)[number];

export const LEAD_STATUSES = [
  "new",
  "contacted",
  "qualified",
  "rejected",
] as const;

export type LeadStatus = (typeof LEAD_STATUSES)[number];

export const ORGANIZER_VERIFICATION_STATUSES = [
  "listed",
  "checked",
  "verified",
  "trusted_by_platform",
  "paused",
  "rejected",
] as const;

export type OrganizerVerificationStatus = (typeof ORGANIZER_VERIFICATION_STATUSES)[number];

export const PROGRAM_PUBLISH_STATUSES = [
  "draft",
  "internal_review",
  "needs_fix",
  "approved",
  "published",
  "paused",
  "archived",
] as const;

export type ProgramPublishStatus = (typeof PROGRAM_PUBLISH_STATUSES)[number];

export const INCIDENT_STATUSES = [
  "open",
  "triaged",
  "investigating",
  "waiting_on_organizer",
  "waiting_on_user",
  "resolved",
  "escalated",
  "closed",
] as const;

export type IncidentStatus = (typeof INCIDENT_STATUSES)[number];

export const COMMISSION_RECONCILIATION_STATUSES = [
  "draft",
  "pending_evidence",
  "accrued",
  "approved",
  "invoiced",
  "partially_paid",
  "paid",
  "reversed",
  "disputed",
  "written_off",
] as const;

export type CommissionReconciliationStatus =
  (typeof COMMISSION_RECONCILIATION_STATUSES)[number];

export const PAYMENT_STATUSES = [
  "recorded",
  "confirmed",
  "failed",
  "reversed",
] as const;

export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

export const REFUND_STATUSES = [
  "recorded",
  "completed",
  "failed",
  "canceled",
] as const;

export type RefundStatus = (typeof REFUND_STATUSES)[number];

export const ORGANIZER_ONBOARDING_STATUSES = [
  "applied",
  "under_review",
  "approved",
  "contract_pending",
  "contract_signed",
  "billing_connected",
  "active",
  "limited",
  "suspended",
] as const;

export type OrganizerOnboardingStatus = (typeof ORGANIZER_ONBOARDING_STATUSES)[number];

export const ORGANIZER_CONTRACT_STATUSES = [
  "not_generated",
  "generated",
  "sent",
  "signed",
  "expired",
  "rejected",
] as const;

export type OrganizerContractStatus = (typeof ORGANIZER_CONTRACT_STATUSES)[number];

export const ORGANIZER_PRIVILEGE_STATUSES = [
  "limited",
  "active",
  "suspended",
] as const;

export type OrganizerPrivilegeStatus = (typeof ORGANIZER_PRIVILEGE_STATUSES)[number];

export const ORGANIZER_BILLING_STATUSES = [
  "not_connected",
  "billing_connected",
  "suspended",
] as const;

export type OrganizerBillingStatus = (typeof ORGANIZER_BILLING_STATUSES)[number];

export const BILLING_STATEMENT_STATUSES = [
  "draft",
  "review",
  "invoiced",
  "paid",
  "disputed",
  "void",
] as const;

export type BillingStatementStatus = (typeof BILLING_STATEMENT_STATUSES)[number];

export function isBookingStatus(s: string): s is BookingStatus {
  return BOOKING_STATUSES.includes(s as BookingStatus);
}

export function isOrganizerVerificationStatus(s: string): s is OrganizerVerificationStatus {
  return ORGANIZER_VERIFICATION_STATUSES.includes(s as OrganizerVerificationStatus);
}

export function isProgramPublishStatus(s: string): s is ProgramPublishStatus {
  return PROGRAM_PUBLISH_STATUSES.includes(s as ProgramPublishStatus);
}

export function isIncidentStatus(s: string): s is IncidentStatus {
  return INCIDENT_STATUSES.includes(s as IncidentStatus);
}

export function isCommissionReconciliationStatus(
  s: string
): s is CommissionReconciliationStatus {
  return COMMISSION_RECONCILIATION_STATUSES.includes(s as CommissionReconciliationStatus);
}

export function isLeadStatus(s: string): s is LeadStatus {
  return LEAD_STATUSES.includes(s as LeadStatus);
}

export function isPaymentStatus(s: string): s is PaymentStatus {
  return PAYMENT_STATUSES.includes(s as PaymentStatus);
}

export function isRefundStatus(s: string): s is RefundStatus {
  return REFUND_STATUSES.includes(s as RefundStatus);
}

export function isOrganizerOnboardingStatus(s: string): s is OrganizerOnboardingStatus {
  return ORGANIZER_ONBOARDING_STATUSES.includes(s as OrganizerOnboardingStatus);
}

export function isOrganizerContractStatus(s: string): s is OrganizerContractStatus {
  return ORGANIZER_CONTRACT_STATUSES.includes(s as OrganizerContractStatus);
}

export function isOrganizerPrivilegeStatus(s: string): s is OrganizerPrivilegeStatus {
  return ORGANIZER_PRIVILEGE_STATUSES.includes(s as OrganizerPrivilegeStatus);
}

export function isOrganizerBillingStatus(s: string): s is OrganizerBillingStatus {
  return ORGANIZER_BILLING_STATUSES.includes(s as OrganizerBillingStatus);
}

export function isBillingStatementStatus(s: string): s is BillingStatementStatus {
  return BILLING_STATEMENT_STATUSES.includes(s as BillingStatementStatus);
}
