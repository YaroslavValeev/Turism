import { Prisma } from "@prisma/client";
import {
  DEFAULT_COMMISSION_RATE_BPS,
  ELIGIBLE_STATEMENT_COMMISSION_STATUSES,
  isPaymentStatus,
  type GenerateStatementInput,
  type OrganizerContractStatus,
  type PrivilegesState,
  type RecordPaymentInput,
  type RecordRefundInput,
} from "@mywave/shared-types";
import { prisma } from "../../lib/prisma";
import { writeAuditLog } from "../../lib/audit";
import { emitBackendAnalyticsEventBestEffort } from "../analytics/service";
import { createDealForBooking, syncDealFromBooking, commissionEligible } from "../deals/dealService";

type Actor = string | null;
type BillingDb = Pick<Prisma.TransactionClient, "booking" | "organizer" | "deal" | "commission" | "auditLog">;
type AnalyticsSink = (event: Record<string, unknown>) => void;

function calcCommission(netAmountRub: number, commissionRateBps: number): number {
  return Math.round((Math.max(0, netAmountRub) * commissionRateBps) / 10000);
}

function deriveBookingStatus(paidAmountRub: number, refundedAmountRub: number): string {
  if (paidAmountRub <= 0) return "created";
  if (refundedAmountRub >= paidAmountRub) return "refunded_full";
  if (refundedAmountRub > 0) return "refunded_partial";
  return "paid_full";
}

async function recalculateCommissionCore(
  bookingId: string,
  actor: Actor,
  db: BillingDb,
  emit: AnalyticsSink,
  preserveLegacyEnsureFailure = false,
) {
  const booking = await db.booking.findUnique({ where: { id: bookingId } });
  if (!booking) {
    throw new Error("Booking not found");
  }
  const organizer = await db.organizer.findUnique({ where: { id: booking.organizerId } });
  if (!organizer) {
    throw new Error("Organizer not found");
  }

  let deal = await db.deal.findUnique({ where: { bookingId } });
  if (!deal) {
    try {
      await createDealForBooking(bookingId, booking.contentItemId ?? null, db);
    } catch (error) {
      // Existing non-transactional callers retry the lookup after an ensure race.
      // A payment transaction must abort with the original cause.
      if (!preserveLegacyEnsureFailure) throw error;
    }
    deal = await db.deal.findUnique({ where: { bookingId } });
  }
  if (deal) {
    await syncDealFromBooking(
      {
        id: booking.id,
        bookingStatus: booking.bookingStatus,
        gmvRub: booking.gmvRub,
        netAmountRub: booking.netAmountRub,
        contentItemId: booking.contentItemId,
      },
      organizer.verificationStatus,
      db,
    );
    deal = await db.deal.findUnique({ where: { bookingId } });
  }
  const dealStatus = deal?.dealStatus ?? "new";
  if (booking.bookingStatus !== "disputed" && !commissionEligible(organizer.verificationStatus, dealStatus)) {
    const zero = await db.commission.upsert({
      where: { bookingId },
      create: {
        bookingId,
        leadId: booking.leadId,
        organizerId: booking.organizerId,
        programId: booking.programId,
        gmvRub: 0,
        commissionRateBps: organizer.commissionRateBps ?? DEFAULT_COMMISSION_RATE_BPS,
        commissionBaseRub: 0,
        commissionAmountRub: 0,
        commissionAccruedRub: 0,
        reconciliationStatus: "reversed",
        calculationJson: {
          reason: "not_eligible",
          need_verified_organizer_and_deal_confirmed_or_completed: true,
          dealStatus,
          verificationStatus: organizer.verificationStatus,
        },
      },
      update: {
        gmvRub: 0,
        commissionBaseRub: 0,
        commissionAmountRub: 0,
        commissionAccruedRub: 0,
        reconciliationStatus: "reversed",
        calculationJson: {
          reason: "not_eligible",
          dealStatus,
          verificationStatus: organizer.verificationStatus,
        },
      },
    });
    return zero;
  }

  const rateBps = organizer.commissionRateBps ?? DEFAULT_COMMISSION_RATE_BPS;
  const paidAmountRub = booking.paidAmountRub ?? 0;
  const refundedAmountRub = booking.refundedAmountRub ?? 0;
  const netAmountRub = Math.max(0, paidAmountRub - refundedAmountRub);
  const commissionAmountRub = calcCommission(netAmountRub, rateBps);
  const status =
    booking.bookingStatus === "disputed"
      ? "disputed"
      : netAmountRub <= 0
        ? "reversed"
        : "accrued";

  const commission = await db.commission.upsert({
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
      reconciliationStatus: status,
      accruedAt: status === "accrued" ? new Date() : null,
      reversedAt: status === "reversed" ? new Date() : null,
      calculationJson: { paidAmountRub, refundedAmountRub, netAmountRub, rateBps },
    },
    update: {
      leadId: booking.leadId,
      gmvRub: netAmountRub,
      commissionRateBps: rateBps,
      commissionBaseRub: netAmountRub,
      commissionAmountRub,
      commissionAccruedRub: commissionAmountRub,
      reconciliationStatus: status,
      accruedAt: status === "accrued" ? new Date() : null,
      reversedAt: status === "reversed" ? new Date() : null,
      calculationJson: { paidAmountRub, refundedAmountRub, netAmountRub, rateBps },
    },
  });

  if (status === "accrued") {
    emit({
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
      properties_json: { reconciliation_status: status },
    });
  }
  if (status === "reversed") {
    emit({
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
      properties_json: { reconciliation_status: status },
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
  }, db);

  return commission;
}

export async function recalculateCommissionForBooking(bookingId: string, actor: Actor) {
  return recalculateCommissionCore(bookingId, actor, prisma, emitBackendAnalyticsEventBestEffort, true);
}

export function derivePaymentBookingStatus(
  currentStatus: string,
  paidAmountRub: number,
  refundedAmountRub: number,
  paymentKind: "partial" | "full",
): string {
  if (currentStatus === "completed" || currentStatus === "disputed") return currentStatus;
  const status = deriveBookingStatus(paidAmountRub, refundedAmountRub);
  if (status === "paid_full" && paymentKind === "partial" && currentStatus !== "paid_full") {
    return "paid_partial";
  }
  return status;
}

export async function recordPayment(input: RecordPaymentInput, actor: Actor) {
  if (!Number.isSafeInteger(input.amountRub) || input.amountRub <= 0 || input.amountRub > 2_147_483_647) {
    throw new Error("amountRub must be a positive integer within the supported range");
  }
  const status = input.status ?? "confirmed";
  const paymentKind = input.paymentKind ?? "full";
  if (!isPaymentStatus(status)) throw new Error("Invalid payment status");
  if (paymentKind !== "partial" && paymentKind !== "full") throw new Error("Invalid payment kind");
  const paidAt = input.paidAt ? new Date(input.paidAt) : new Date();
  if (Number.isNaN(paidAt.valueOf())) throw new Error("paidAt must be a valid date");

  const committed = await prisma.$transaction(async (tx) => {
    // Serialize different payments for the same booking across API processes.
    const locked = await tx.$queryRaw<Array<{ id: string }>>(
      Prisma.sql`SELECT "id" FROM "bookings" WHERE "id" = ${input.bookingId} FOR UPDATE`,
    );
    if (locked.length === 0) throw new Error("Booking not found");
    const booking = await tx.booking.findUnique({ where: { id: input.bookingId } });
    if (!booking) throw new Error("Booking not found");
    const events: Record<string, unknown>[] = [];
    const payment = await tx.payment.create({
      data: {
        bookingId: booking.id,
        leadId: booking.leadId,
        organizerId: booking.organizerId,
        programId: booking.programId,
        amountRub: input.amountRub,
        status,
        paymentKind,
        paidAt,
        externalReference: input.externalReference ?? null,
        paymentMethod: input.paymentMethod ?? null,
        notes: input.notes ?? null,
      },
    });
    await writeAuditLog({
      entityType: "payment",
      entityId: payment.id,
      changedField: "payment_recorded",
      oldValue: null,
      newValue: String(payment.amountRub),
      changedBy: actor,
      reason: "manual payment recorded",
    }, tx);
    events.push({
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

    let commission = await tx.commission.findUnique({ where: { bookingId: booking.id } });
    if (status === "confirmed") {
      const paidAmountRub = (booking.paidAmountRub ?? 0) + input.amountRub;
      if (paidAmountRub > 2_147_483_647) throw new Error("Total paid amount exceeds the supported range");
      const refundedAmountRub = booking.refundedAmountRub ?? 0;
      const netAmountRub = Math.max(0, paidAmountRub - refundedAmountRub);
      const bookingStatus = derivePaymentBookingStatus(booking.bookingStatus, paidAmountRub, refundedAmountRub, paymentKind);
      await tx.booking.update({
        where: { id: booking.id },
        data: { paidAmountRub, netAmountRub, bookingStatus },
      });
      commission = await recalculateCommissionCore(booking.id, actor, tx, (event) => events.push(event));
    }
    return { payment, commission, events };
  }, { maxWait: 10_000, timeout: 15_000 });

  // Never publish events for a payment whose database transaction rolled back.
  for (const event of committed.events) emitBackendAnalyticsEventBestEffort(event);
  return { payment: committed.payment, commission: committed.commission };
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
  await prisma.booking.update({
    where: { id: booking.id },
    data: {
      refundedAmountRub: nextRefundedAmountRub,
      netAmountRub,
      bookingStatus,
    },
  });

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
    const commissionTotalRub = items.reduce((sum, c) => sum + (c.commissionAmountRub ?? 0), 0);
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
        notes: input.notes ?? null,
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
