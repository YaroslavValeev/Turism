import { Prisma } from "@prisma/client";
import { parsePlatformMode } from "@mywave/config";
import { isValidCommissionReconciliationBillingTransition } from "@mywave/shared-policy";
import {
  DEFAULT_COMMISSION_RATE_BPS,
  ELIGIBLE_STATEMENT_COMMISSION_STATUSES,
  isCommissionReconciliationStatus,
  type GenerateStatementInput,
  type OrganizerContractStatus,
  type PrivilegesState,
  type RecordPaymentInput,
  type RecordRefundInput,
} from "@mywave/shared-types";
import { prisma } from "../../lib/prisma";
import { writeAuditLog } from "../../lib/audit";
import { emitBackendAnalyticsEventBestEffort } from "../analytics/service";
import { emitCommissionPolicyViolationAnalyticsBestEffort } from "../status-engine/emitCommissionPolicyViolationAnalytics";
import { recordCommissionTransitionViolationDetected } from "../status-engine/recordCommissionTransitionViolation";
import { recordDomainStatusEvent } from "../status-engine/recordDomainStatusEvent";
import { deriveBookingStatus } from "./deriveBookingStatus";

type Actor = string | null;

function calcCommission(netAmountRub: number, commissionRateBps: number): number {
  return Math.round((Math.max(0, netAmountRub) * commissionRateBps) / 10000);
}

export async function recalculateCommissionForBooking(bookingId: string, actor: Actor) {
  const booking = await prisma.booking.findUnique({ where: { id: bookingId } });
  if (!booking) {
    throw new Error("Booking not found");
  }
  const organizer = await prisma.organizer.findUnique({ where: { id: booking.organizerId } });
  const rateBps = organizer?.commissionRateBps ?? DEFAULT_COMMISSION_RATE_BPS;
  const paidAmountRub = booking.paidAmountRub ?? 0;
  const refundedAmountRub = booking.refundedAmountRub ?? 0;
  const netAmountRub = Math.max(0, paidAmountRub - refundedAmountRub);
  const commissionAmountRub = calcCommission(netAmountRub, rateBps);
  const platformMode = parsePlatformMode(process.env.PLATFORM_MODE);
  // Model A: reward-скидка уже учтена в paidAmountRub (гость платил finalAmount).
  // В calculationJson фиксируем снимок экономики для прозрачности.
  const rewardSnapshot = {
    appliedRewardId: booking.appliedRewardId ?? null,
    originalAmountRub: booking.originalAmountRub ?? null,
    discountAmountRub: booking.discountAmountRub ?? null,
    finalAmountRub: booking.finalAmountRub ?? null,
  };
  const calculationBase = {
    paidAmountRub,
    refundedAmountRub,
    netAmountRub,
    rateBps,
    reward: rewardSnapshot,
    platformMode,
    ...(platformMode === "launch" ? { financialDueRub: 0 as const } : {}),
  };
  const status =
    booking.bookingStatus === "disputed"
      ? "disputed"
      : netAmountRub <= 0
        ? "reversed"
        : "accrued";

  const existingCommission = await prisma.commission.findUnique({ where: { bookingId } });
  const fromStatus = existingCommission?.reconciliationStatus ?? "";
  if (
    existingCommission &&
    isCommissionReconciliationStatus(fromStatus) &&
    !isValidCommissionReconciliationBillingTransition(fromStatus, status, "recalculate")
  ) {
    console.warn("[billing] recalculate commission policy mismatch (logged, upsert continues)", {
      commissionId: existingCommission.id,
      fromStatus,
      to: status,
      bookingId,
    });
    await recordCommissionTransitionViolationDetected(prisma, {
      commissionId: existingCommission.id,
      fromStatus,
      toStatus: status,
      reason: "billing_recalculate_policy_mismatch_soft_allow",
      actorId: actor,
      actorMarker: "system:billing",
      source: "billing",
      billingKind: "recalculate",
      triggerMode: "auto",
    });
    emitCommissionPolicyViolationAnalyticsBestEffort({
      commissionId: existingCommission.id,
      organizerId: existingCommission.organizerId,
      programId: existingCommission.programId,
      bookingId: existingCommission.bookingId,
      fromStatus,
      toStatus: status,
      source: "billing",
      billingKind: "recalculate",
      idempotencySuffix: bookingId,
    });
  }

  const commission = await prisma.commission.upsert({
    where: { bookingId },
    create: {
      bookingId,
      leadId: booking.leadId,
      organizerId: booking.organizerId,
      programId: booking.programId,
      gmvRub: netAmountRub,
      commissionRateBps: rateBps,
      commissionBaseRub: netAmountRub,
      commissionAmountRub,
      commissionAccruedRub: commissionAmountRub,
      commissionCollectedRub: platformMode === "launch" ? 0 : undefined,
      reconciliationStatus: status,
      accruedAt: status === "accrued" ? new Date() : null,
      reversedAt: status === "reversed" ? new Date() : null,
      calculationJson: calculationBase,
    },
    update: {
      leadId: booking.leadId,
      gmvRub: netAmountRub,
      commissionRateBps: rateBps,
      commissionBaseRub: netAmountRub,
      commissionAmountRub,
      commissionAccruedRub: commissionAmountRub,
      commissionCollectedRub: platformMode === "launch" ? 0 : undefined,
      reconciliationStatus: status,
      accruedAt: status === "accrued" ? new Date() : null,
      reversedAt: status === "reversed" ? new Date() : null,
      calculationJson: calculationBase,
    },
  });

  if (status === "accrued") {
    emitBackendAnalyticsEventBestEffort({
      event_name: "commission_accrued",
      event_version: 1,
      event_source: "backend",
      event_time: new Date().toISOString(),
      idempotency_key: `commission_accrued:${commission.id}:${commission.commissionAmountRub ?? 0}:${commission.commissionRateBps ?? 0}`,
      organizer_id: commission.organizerId,
      program_id: commission.programId,
      booking_id: commission.bookingId,
      lead_id: commission.leadId ?? undefined,
      commission_id: commission.id,
      commission_amount: commission.commissionAmountRub ?? undefined,
      commission_rate: commission.commissionRateBps ?? undefined,
      net_amount: commission.gmvRub ?? undefined,
      properties_json: {
        reconciliation_status: status,
        platform_mode: platformMode,
        financial_due_rub: platformMode === "launch" ? 0 : commission.commissionAmountRub ?? undefined,
      },
    });
  }
  if (status === "reversed") {
    emitBackendAnalyticsEventBestEffort({
      event_name: "commission_reversed",
      event_version: 1,
      event_source: "backend",
      event_time: new Date().toISOString(),
      idempotency_key: `commission_reversed:${commission.id}:${commission.commissionAmountRub ?? 0}:${commission.commissionRateBps ?? 0}`,
      organizer_id: commission.organizerId,
      program_id: commission.programId,
      booking_id: commission.bookingId,
      lead_id: commission.leadId ?? undefined,
      commission_id: commission.id,
      commission_amount: commission.commissionAmountRub ?? undefined,
      commission_rate: commission.commissionRateBps ?? undefined,
      net_amount: commission.gmvRub ?? undefined,
      properties_json: { reconciliation_status: status, platform_mode: platformMode },
    });
  }

  await writeAuditLog({
    entityType: "commission",
    entityId: commission.id,
    changedField: "commission_recalculated",
    oldValue: null,
    newValue: JSON.stringify({ netAmountRub, rateBps, commissionAmountRub, status }),
    changedBy: actor,
    reason: "payment/refund recalculation",
  });

  return commission;
}

export async function recordPayment(input: RecordPaymentInput, actor: Actor) {
  const booking = await prisma.booking.findUnique({ where: { id: input.bookingId } });
  if (!booking) throw new Error("Booking not found");
  if (input.amountRub <= 0) throw new Error("amountRub must be positive");

  const payment = await prisma.payment.create({
    data: {
      bookingId: booking.id,
      leadId: booking.leadId,
      organizerId: booking.organizerId,
      programId: booking.programId,
      amountRub: input.amountRub,
      status: input.status ?? "confirmed",
      paymentKind: input.paymentKind ?? "full",
      paidAt: input.paidAt ? new Date(input.paidAt) : new Date(),
      externalReference: input.externalReference ?? null,
      paymentMethod: input.paymentMethod ?? null,
      notes: input.notes ?? null,
    },
  });

  emitBackendAnalyticsEventBestEffort({
    event_name: "payment_recorded",
    event_version: 1,
    event_source: "backend",
    event_time: payment.paidAt.toISOString(),
    idempotency_key: `payment_recorded:${payment.id}`,
    organizer_id: booking.organizerId,
    program_id: booking.programId,
    booking_id: booking.id,
    lead_id: booking.leadId ?? undefined,
    payment_id: payment.id,
    payment_status: payment.status,
    gross_amount: payment.amountRub,
    properties_json: { payment_kind: payment.paymentKind },
  });

  const paidAmountRub = (booking.paidAmountRub ?? 0) + input.amountRub;
  const refundedAmountRub = booking.refundedAmountRub ?? 0;
  const netAmountRub = Math.max(0, paidAmountRub - refundedAmountRub);
  const bookingStatus = deriveBookingStatus(paidAmountRub, refundedAmountRub);
  const prevBookingStatus = booking.bookingStatus;

  // ADR-007: billing-derived path — `bookingStatus` только из `deriveBookingStatus` + событие `booking_payment_derived_status`.
  await prisma.booking.update({
    where: { id: booking.id },
    data: {
      paidAmountRub,
      netAmountRub,
      bookingStatus,
    },
  });

  if (prevBookingStatus !== bookingStatus) {
    await recordDomainStatusEvent(prisma, {
      eventType: "booking_payment_derived_status",
      entityType: "booking",
      entityId: booking.id,
      fromStatus: prevBookingStatus,
      toStatus: bookingStatus,
      triggerMode: "auto",
      actorId: actor,
      actorMarker: actor ? null : "system:billing",
      source: "billing/recordPayment",
      payloadJson: { paidAmountRub, netAmountRub, paymentId: payment.id },
      idempotencyKey: `billing_payment_status:${booking.id}:${payment.id}`,
    });
  }

  await writeAuditLog({
    entityType: "payment",
    entityId: payment.id,
    changedField: "payment_recorded",
    oldValue: null,
    newValue: String(payment.amountRub),
    changedBy: actor,
    reason: "manual payment recorded",
  });

  const commission = await recalculateCommissionForBooking(booking.id, actor);
  return { payment, commission };
}

export async function recordRefund(input: RecordRefundInput, actor: Actor) {
  const booking = await prisma.booking.findUnique({ where: { id: input.bookingId } });
  if (!booking) throw new Error("Booking not found");
  if (input.amountRub <= 0) throw new Error("amountRub must be positive");

  const paidAmountRub = booking.paidAmountRub ?? 0;
  const nextRefundedAmountRub = (booking.refundedAmountRub ?? 0) + input.amountRub;
  if (nextRefundedAmountRub > paidAmountRub) {
    throw new Error("Refund cannot exceed paid amount");
  }

  const refund = await prisma.refund.create({
    data: {
      bookingId: booking.id,
      paymentId: input.paymentId ?? null,
      leadId: booking.leadId,
      organizerId: booking.organizerId,
      programId: booking.programId,
      amountRub: input.amountRub,
      status: input.status ?? "completed",
      refundedAt: input.refundedAt ? new Date(input.refundedAt) : new Date(),
      reason: input.reason ?? null,
      externalReference: input.externalReference ?? null,
    },
  });

  emitBackendAnalyticsEventBestEffort({
    event_name: "refund_recorded",
    event_version: 1,
    event_source: "backend",
    event_time: refund.refundedAt.toISOString(),
    idempotency_key: `refund_recorded:${refund.id}`,
    organizer_id: booking.organizerId,
    program_id: booking.programId,
    booking_id: booking.id,
    lead_id: booking.leadId ?? undefined,
    refund_id: refund.id,
    payment_id: refund.paymentId ?? undefined,
    refund_amount: refund.amountRub,
    properties_json: { status: refund.status },
  });

  const netAmountRub = Math.max(0, paidAmountRub - nextRefundedAmountRub);
  const bookingStatus = deriveBookingStatus(paidAmountRub, nextRefundedAmountRub);
  const prevBookingStatus = booking.bookingStatus;

  // ADR-007: billing-derived path (refund) — см. `deriveBookingStatus`.
  await prisma.booking.update({
    where: { id: booking.id },
    data: {
      refundedAmountRub: nextRefundedAmountRub,
      netAmountRub,
      bookingStatus,
    },
  });

  if (prevBookingStatus !== bookingStatus) {
    await recordDomainStatusEvent(prisma, {
      eventType: "booking_payment_derived_status",
      entityType: "booking",
      entityId: booking.id,
      fromStatus: prevBookingStatus,
      toStatus: bookingStatus,
      triggerMode: "auto",
      actorId: actor,
      actorMarker: actor ? null : "system:billing",
      source: "billing/recordRefund",
      payloadJson: { paidAmountRub, refundedAmountRub: nextRefundedAmountRub, netAmountRub, refundId: refund.id },
      idempotencyKey: `billing_refund_status:${booking.id}:${refund.id}`,
    });
  }

  await writeAuditLog({
    entityType: "refund",
    entityId: refund.id,
    changedField: "refund_recorded",
    oldValue: null,
    newValue: String(refund.amountRub),
    changedBy: actor,
    reason: "manual refund recorded",
  });

  const commission = await recalculateCommissionForBooking(booking.id, actor);
  return { refund, commission };
}

export async function generateMonthlyStatement(input: GenerateStatementInput, actor: Actor) {
  const platformMode = parsePlatformMode(process.env.PLATFORM_MODE);
  const periodStart = new Date(input.periodStart);
  const periodEnd = new Date(input.periodEnd);
  if (Number.isNaN(periodStart.valueOf()) || Number.isNaN(periodEnd.valueOf())) {
    throw new Error("periodStart and periodEnd must be valid dates");
  }
  if (periodEnd < periodStart) {
    throw new Error("periodEnd must be >= periodStart");
  }

  const where: Prisma.CommissionWhereInput = {
    reconciliationStatus: { in: ELIGIBLE_STATEMENT_COMMISSION_STATUSES },
    createdAt: { gte: periodStart, lte: periodEnd },
    ...(input.organizerId ? { organizerId: input.organizerId } : {}),
  };
  const commissions = await prisma.commission.findMany({
    where,
    include: {
      booking: true,
    },
    orderBy: { createdAt: "asc" },
  });

  if (commissions.length === 0) {
    throw new Error("No eligible commissions found");
  }

  const grouped = new Map<string, typeof commissions>();
  for (const commission of commissions) {
    const list = grouped.get(commission.organizerId) ?? [];
    list.push(commission);
    grouped.set(commission.organizerId, list);
  }

  const created = [];
  for (const [organizerId, items] of grouped.entries()) {
    const grossPaidRub = items.reduce((sum, c) => sum + (c.booking.paidAmountRub ?? 0), 0);
    const refundedRub = items.reduce((sum, c) => sum + (c.booking.refundedAmountRub ?? 0), 0);
    const netSalesRub = items.reduce((sum, c) => sum + (c.booking.netAmountRub ?? 0), 0);
    const commissionCalculatedRub = items.reduce((sum, c) => sum + (c.commissionAmountRub ?? 0), 0);
    const commissionTotalRub = platformMode === "launch" ? 0 : commissionCalculatedRub;
    const launchNote =
      platformMode === "launch"
        ? "Launch mode: строки содержат рассчитанную комиссию; итог к оплате по платформе = 0 ₽."
        : null;
    const mergedNotes = [input.notes?.trim(), launchNote].filter(Boolean).join("\n") || null;
    const statement = await prisma.billingStatement.create({
      data: {
        organizerId,
        periodStart,
        periodEnd,
        status: input.status ?? "draft",
        grossPaidRub,
        refundedRub,
        netSalesRub,
        commissionTotalRub,
        notes: mergedNotes,
        lines: {
          create: items.map((c) => ({
            commissionId: c.id,
            bookingId: c.bookingId,
            paidAmountRub: c.booking.paidAmountRub ?? 0,
            refundedAmountRub: c.booking.refundedAmountRub ?? 0,
            netAmountRub: c.booking.netAmountRub ?? 0,
            commissionRateBps: c.commissionRateBps ?? DEFAULT_COMMISSION_RATE_BPS,
            commissionAmountRub: c.commissionAmountRub ?? 0,
          })),
        },
      },
      include: { lines: true },
    });

    for (const commission of items) {
      const fromStatus = commission.reconciliationStatus ?? "";
      if (
        isCommissionReconciliationStatus(fromStatus) &&
        !isValidCommissionReconciliationBillingTransition(fromStatus, "invoiced", "statement_invoiced")
      ) {
        console.warn("[billing] statement invoiced policy mismatch (logged, update continues)", {
          commissionId: commission.id,
          fromStatus,
          to: "invoiced",
        });
        await recordCommissionTransitionViolationDetected(prisma, {
          commissionId: commission.id,
          fromStatus,
          toStatus: "invoiced",
          reason: "billing_statement_invoiced_policy_mismatch_soft_allow",
          actorId: actor,
          actorMarker: "system:billing",
          source: "billing",
          billingKind: "statement_invoiced",
          triggerMode: "auto",
        });
        emitCommissionPolicyViolationAnalyticsBestEffort({
          commissionId: commission.id,
          organizerId: commission.organizerId,
          programId: commission.programId,
          bookingId: commission.bookingId,
          fromStatus,
          toStatus: "invoiced",
          source: "billing",
          billingKind: "statement_invoiced",
          idempotencySuffix: `${statement.id}:${commission.id}`,
        });
      }
      await prisma.commission.update({
        where: { id: commission.id },
        data: { reconciliationStatus: "invoiced", invoicedAt: new Date() },
      });
    }
    await writeAuditLog({
      entityType: "billing_statement",
      entityId: statement.id,
      changedField: "statement_generated",
      oldValue: null,
      newValue: JSON.stringify({
        organizerId,
        periodStart: input.periodStart,
        periodEnd: input.periodEnd,
        commissionCount: items.length,
      }),
      changedBy: actor,
      reason: "monthly draft statement generated",
    });

    emitBackendAnalyticsEventBestEffort({
      event_name: "statement_generated",
      event_version: 1,
      event_source: "backend",
      event_time: new Date().toISOString(),
      idempotency_key: `statement_generated:${statement.id}`,
      organizer_id: organizerId,
      statement_id: statement.id,
      gross_amount: statement.grossPaidRub,
      refund_amount: statement.refundedRub,
      net_amount: statement.netSalesRub,
      commission_amount: statement.commissionTotalRub,
      properties_json: {
        period_start: input.periodStart,
        period_end: input.periodEnd,
        commission_count: items.length,
        status: statement.status,
        platform_mode: platformMode,
        commission_calculated_rub: commissionCalculatedRub,
      },
    });
    created.push(statement);
  }

  return created;
}

export async function deriveOrganizerPrivileges(organizerId: string): Promise<PrivilegesState> {
  const organizer = await prisma.organizer.findUnique({
    where: { id: organizerId },
    include: {
      contracts: { orderBy: { createdAt: "desc" }, take: 1 },
      billingProfile: true,
    },
  });
  if (!organizer) {
    throw new Error("Organizer not found");
  }
  const contractStatus = (organizer.contracts[0]?.status ?? null) as OrganizerContractStatus | null;
  const hasSignedContract = contractStatus === "signed";
  const billingConnected =
    organizer.billingStatus === "billing_connected" ||
    organizer.billingProfile?.billingStatus === "billing_connected";

  const onboardingStatus = hasSignedContract
    ? billingConnected
      ? "active"
      : "contract_signed"
    : "contract_pending";
  const privilegeStatus = hasSignedContract && billingConnected ? "active" : "limited";

  return {
    onboardingStatus,
    billingStatus: billingConnected ? "billing_connected" : "not_connected",
    privilegeStatus,
    contractStatus,
  };
}
