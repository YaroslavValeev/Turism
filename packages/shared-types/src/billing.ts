import type {
  BillingStatementStatus,
  BookingStatus,
  CommissionReconciliationStatus,
  OrganizerBillingStatus,
  OrganizerContractStatus,
  OrganizerOnboardingStatus,
  OrganizerPrivilegeStatus,
  PaymentStatus,
  RefundStatus,
} from "./statuses";

export const DEFAULT_COMMISSION_RATE_BPS = 300;
export const DEFAULT_ATTRIBUTION_WINDOW_DAYS = 60;

export const ELIGIBLE_STATEMENT_COMMISSION_STATUSES: CommissionReconciliationStatus[] = [
  "accrued",
  "approved",
];

export type BillingCommissionSnapshot = {
  bookingId: string;
  leadId: string | null;
  paidAmountRub: number;
  refundedAmountRub: number;
  netAmountRub: number;
  commissionRateBps: number;
  commissionAmountRub: number;
  reconciliationStatus: CommissionReconciliationStatus;
  bookingStatus: BookingStatus;
};

export type RecordPaymentInput = {
  bookingId: string;
  amountRub: number;
  status?: PaymentStatus;
  paymentKind?: "partial" | "full";
  paidAt?: string;
  externalReference?: string;
  paymentMethod?: string;
  notes?: string;
};

export type RecordRefundInput = {
  bookingId: string;
  paymentId?: string;
  amountRub: number;
  status?: RefundStatus;
  refundedAt?: string;
  reason?: string;
  externalReference?: string;
};

export type GenerateStatementInput = {
  organizerId?: string;
  periodStart: string;
  periodEnd: string;
  status?: BillingStatementStatus;
  notes?: string;
};

export type PrivilegesState = {
  onboardingStatus: OrganizerOnboardingStatus;
  billingStatus: OrganizerBillingStatus;
  privilegeStatus: OrganizerPrivilegeStatus;
  contractStatus: OrganizerContractStatus | null;
};
