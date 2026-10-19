import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const transaction = vi.fn();
  return { transaction, emit: vi.fn(), db: { $transaction: transaction } as Record<string, any> };
});
vi.mock("../../lib/prisma", () => ({ prisma: mocks.db }));
vi.mock("../analytics/service", () => ({ emitBackendAnalyticsEventBestEffort: mocks.emit }));

import { derivePaymentBookingStatus, recalculateCommissionForBooking, recordPayment } from "./service";

describe("confirmed payment ledger", () => {
  let tx: any;
  let booking: any;

  beforeEach(() => {
    vi.clearAllMocks();
    booking = {
      id: "booking", organizerId: "organizer", programId: "program", leadId: null,
      paidAmountRub: 0, refundedAmountRub: 0, netAmountRub: 0,
      bookingStatus: "booked", gmvRub: null, contentItemId: null,
    };
    const deal = { id: "deal", dealStatus: "confirmed", commissionRatePct: 3 };
    tx = {
      $queryRaw: vi.fn().mockResolvedValue([{ id: booking.id }]),
      booking: {
        findUnique: vi.fn().mockImplementation(async () => ({ ...booking })),
        update: vi.fn().mockImplementation(async ({ data }) => Object.assign(booking, data)),
      },
      payment: { create: vi.fn().mockImplementation(async ({ data }) => ({ id: "payment", ...data })) },
      auditLog: { create: vi.fn().mockResolvedValue({ id: "audit" }) },
      organizer: { findUnique: vi.fn().mockResolvedValue({ verificationStatus: "verified", commissionRateBps: 300 }) },
      deal: {
        findUnique: vi.fn().mockImplementation(async () => ({ ...deal })),
        update: vi.fn().mockImplementation(async ({ data }) => Object.assign(deal, data)),
      },
      commission: {
        findUnique: vi.fn().mockResolvedValue(null),
        upsert: vi.fn().mockImplementation(async ({ create }) => ({ id: "commission", ...create })),
      },
    };
    Object.assign(mocks.db, tx);
    mocks.transaction.mockImplementation(async (callback) => {
      const result = await callback(tx);
      expect(mocks.emit).not.toHaveBeenCalled();
      return result;
    });
  });

  it.each(["recorded", "failed", "reversed"] as const)("stores %s without changing financial state", async (status) => {
    const result = await recordPayment({ bookingId: "booking", amountRub: 10000, status }, "admin");
    expect(result.payment.status).toBe(status);
    expect(result.commission).toBeNull();
    expect(tx.payment.create).toHaveBeenCalledOnce();
    expect(tx.auditLog.create).toHaveBeenCalledOnce();
    expect(tx.booking.update).not.toHaveBeenCalled();
    expect(tx.deal.update).not.toHaveBeenCalled();
    expect(tx.commission.upsert).not.toHaveBeenCalled();
    expect(booking.paidAmountRub).toBe(0);
    expect(mocks.emit).toHaveBeenCalledOnce();
    expect(mocks.emit.mock.calls[0][0]).toMatchObject({ event_name: "payment_recorded", payment_status: status });
  });

  it("commits confirmed partial payment, totals, audit and commission through one client", async () => {
    const result = await recordPayment({ bookingId: "booking", amountRub: 3000, paymentKind: "partial" }, "admin");
    expect(mocks.transaction).toHaveBeenCalledOnce();
    expect(tx.$queryRaw).toHaveBeenCalledOnce();
    expect(booking).toMatchObject({ bookingStatus: "paid_partial", paidAmountRub: 3000, netAmountRub: 3000 });
    expect(result.commission).toMatchObject({ commissionAmountRub: 90, reconciliationStatus: "accrued" });
    expect(tx.auditLog.create).toHaveBeenCalledTimes(2);
    expect(mocks.emit.mock.calls.map(([event]) => event.event_name)).toEqual(["payment_recorded", "commission_accrued"]);
  });

  it("does not emit an event when a later commission write aborts the transaction", async () => {
    tx.commission.upsert.mockRejectedValue(new Error("QA commission fault"));
    await expect(recordPayment({ bookingId: "booking", amountRub: 3000 }, "admin")).rejects.toThrow("QA commission fault");
    expect(mocks.emit).not.toHaveBeenCalled();
  });

  it("preserves the legacy ensure-race lookup for non-transactional commission callers", async () => {
    tx.deal.findUnique.mockResolvedValueOnce(null).mockResolvedValue({ id: "deal", dealStatus: "confirmed", commissionRatePct: 3 });
    tx.deal.upsert = vi.fn().mockRejectedValue(new Error("QA legacy ensure race"));
    await expect(recalculateCommissionForBooking("booking", "admin")).resolves.toMatchObject({ reconciliationStatus: "reversed" });
    expect(tx.deal.upsert).toHaveBeenCalledOnce();
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("propagates the original ensure failure from a payment transaction without events", async () => {
    const failure = new Error("QA payment ensure failure");
    tx.deal.findUnique.mockResolvedValue(null);
    tx.deal.upsert = vi.fn().mockRejectedValue(failure);
    await expect(recordPayment({ bookingId: "booking", amountRub: 3000 }, "admin")).rejects.toBe(failure);
    expect(tx.booking.update).toHaveBeenCalledOnce();
    expect(mocks.emit).not.toHaveBeenCalled();
  });

  it("fails before ledger creation when the booking cannot be locked", async () => {
    tx.$queryRaw.mockResolvedValue([]);
    await expect(recordPayment({ bookingId: "missing", amountRub: 3000 }, "admin")).rejects.toThrow("Booking not found");
    expect(tx.payment.create).not.toHaveBeenCalled();
    expect(mocks.emit).not.toHaveBeenCalled();
  });

  it.each([0, -1, 0.5, Number.NaN, Number.POSITIVE_INFINITY, 2_147_483_648])("rejects invalid amount %s before a transaction", async (amountRub) => {
    await expect(recordPayment({ bookingId: "booking", amountRub }, "admin")).rejects.toThrow("positive integer");
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("rejects invalid date and kind before a transaction", async () => {
    await expect(recordPayment({ bookingId: "booking", amountRub: 1, paidAt: "invalid" }, "admin")).rejects.toThrow("valid date");
    await expect(recordPayment({ bookingId: "booking", amountRub: 1, paymentKind: "unknown" as any }, "admin")).rejects.toThrow("payment kind");
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it.each([
    ["booked", 3000, 0, "partial", "paid_partial"],
    ["paid_partial", 6000, 0, "partial", "paid_partial"],
    ["paid_partial", 10000, 0, "full", "paid_full"],
    ["paid_full", 12000, 0, "partial", "paid_full"],
    ["completed", 12000, 0, "partial", "completed"],
    ["disputed", 12000, 0, "full", "disputed"],
    ["paid_partial", 6000, 1000, "partial", "refunded_partial"],
  ] as const)("derives %s/%s/%s/%s as %s", (current, paid, refunded, kind, expected) => {
    expect(derivePaymentBookingStatus(current, paid, refunded, kind)).toBe(expected);
  });
});
