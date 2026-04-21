import { describe, it, expect, vi } from "vitest";
import { recoverRewardOnCancellation, isCancellationKind } from "./recoveryService";

vi.mock("../../lib/audit", () => ({
  writeAuditLog: vi.fn().mockResolvedValue(undefined),
}));

type BookingRow = {
  id: string;
  appliedRewardId: string | null;
  completedAt: Date | null;
};
type RewardRow = {
  id: string;
  status: string;
  usedBookingId: string | null;
};

function mkPrisma(opts: {
  booking: BookingRow | null;
  reward?: RewardRow | null;
  updateManyCount?: number;
}) {
  const updateMany = vi.fn().mockResolvedValue({ count: opts.updateManyCount ?? 1 });
  return {
    prisma: {
      booking: {
        findUnique: vi.fn().mockResolvedValue(opts.booking),
      },
      userReward: {
        findUnique: vi.fn().mockResolvedValue(opts.reward ?? null),
        updateMany,
      },
    } as unknown as Parameters<typeof recoverRewardOnCancellation>[0],
    updateMany,
  };
}

describe("recoverRewardOnCancellation", () => {
  it("recovers reward for user_cancelled before completion", async () => {
    const { prisma, updateMany } = mkPrisma({
      booking: { id: "b1", appliedRewardId: "r1", completedAt: null },
      reward: { id: "r1", status: "used", usedBookingId: "b1" },
    });
    const res = await recoverRewardOnCancellation(prisma, {
      bookingId: "b1",
      cancellationKind: "user_cancelled",
      actorId: null,
    });
    expect(res.recovered).toBe(true);
    expect(updateMany).toHaveBeenCalledOnce();
    const args = updateMany.mock.calls[0][0];
    expect(args.where).toMatchObject({ id: "r1", status: "used", usedBookingId: "b1" });
    expect(args.data).toMatchObject({
      status: "available",
      usedBookingId: null,
      usedAt: null,
      recoveredCancellationKind: "user_cancelled",
    });
  });

  it("recovers for organizer_cancelled", async () => {
    const { prisma } = mkPrisma({
      booking: { id: "b1", appliedRewardId: "r1", completedAt: null },
      reward: { id: "r1", status: "used", usedBookingId: "b1" },
    });
    const res = await recoverRewardOnCancellation(prisma, {
      bookingId: "b1",
      cancellationKind: "organizer_cancelled",
      actorId: null,
    });
    expect(res.recovered).toBe(true);
  });

  it("does NOT recover for no_show", async () => {
    const { prisma, updateMany } = mkPrisma({
      booking: { id: "b1", appliedRewardId: "r1", completedAt: null },
      reward: { id: "r1", status: "used", usedBookingId: "b1" },
    });
    const res = await recoverRewardOnCancellation(prisma, {
      bookingId: "b1",
      cancellationKind: "no_show",
      actorId: null,
    });
    expect(res.recovered).toBe(false);
    expect(res).toMatchObject({ reason: "policy_no_show" });
    expect(updateMany).not.toHaveBeenCalled();
  });

  it("does NOT recover for fraud", async () => {
    const { prisma } = mkPrisma({
      booking: { id: "b1", appliedRewardId: "r1", completedAt: null },
      reward: { id: "r1", status: "used", usedBookingId: "b1" },
    });
    const res = await recoverRewardOnCancellation(prisma, {
      bookingId: "b1",
      cancellationKind: "fraud",
      actorId: null,
    });
    expect(res.recovered).toBe(false);
    expect(res).toMatchObject({ reason: "policy_fraud" });
  });

  it("does NOT recover if booking was completed", async () => {
    const { prisma } = mkPrisma({
      booking: { id: "b1", appliedRewardId: "r1", completedAt: new Date() },
      reward: { id: "r1", status: "used", usedBookingId: "b1" },
    });
    const res = await recoverRewardOnCancellation(prisma, {
      bookingId: "b1",
      cancellationKind: "user_cancelled",
      actorId: null,
    });
    expect(res.recovered).toBe(false);
    expect(res).toMatchObject({ reason: "was_completed" });
  });

  it("is idempotent: already available → no-op", async () => {
    const { prisma, updateMany } = mkPrisma({
      booking: { id: "b1", appliedRewardId: "r1", completedAt: null },
      reward: { id: "r1", status: "available", usedBookingId: null },
    });
    const res = await recoverRewardOnCancellation(prisma, {
      bookingId: "b1",
      cancellationKind: "user_cancelled",
      actorId: null,
    });
    expect(res.recovered).toBe(false);
    expect(res).toMatchObject({ reason: "already_available" });
    expect(updateMany).not.toHaveBeenCalled();
  });

  it("refuses recovery when reward bound to another booking", async () => {
    const { prisma, updateMany } = mkPrisma({
      booking: { id: "b1", appliedRewardId: "r1", completedAt: null },
      reward: { id: "r1", status: "used", usedBookingId: "b-other" },
    });
    const res = await recoverRewardOnCancellation(prisma, {
      bookingId: "b1",
      cancellationKind: "user_cancelled",
      actorId: null,
    });
    expect(res.recovered).toBe(false);
    expect(res).toMatchObject({ reason: "bound_to_other_booking" });
    expect(updateMany).not.toHaveBeenCalled();
  });

  it("no applied reward → no-op", async () => {
    const { prisma } = mkPrisma({
      booking: { id: "b1", appliedRewardId: null, completedAt: null },
    });
    const res = await recoverRewardOnCancellation(prisma, {
      bookingId: "b1",
      cancellationKind: "user_cancelled",
      actorId: null,
    });
    expect(res.recovered).toBe(false);
    expect(res).toMatchObject({ reason: "no_applied_reward" });
  });

  it("race: updateMany returns 0 → race_or_changed", async () => {
    const { prisma } = mkPrisma({
      booking: { id: "b1", appliedRewardId: "r1", completedAt: null },
      reward: { id: "r1", status: "used", usedBookingId: "b1" },
      updateManyCount: 0,
    });
    const res = await recoverRewardOnCancellation(prisma, {
      bookingId: "b1",
      cancellationKind: "user_cancelled",
      actorId: null,
    });
    expect(res.recovered).toBe(false);
    expect(res).toMatchObject({ reason: "race_or_changed" });
  });

  it("unknown kind is treated as null (recoverable)", async () => {
    const { prisma } = mkPrisma({
      booking: { id: "b1", appliedRewardId: "r1", completedAt: null },
      reward: { id: "r1", status: "used", usedBookingId: "b1" },
    });
    // null cancellationKind: recovery происходит (default trust).
    const res = await recoverRewardOnCancellation(prisma, {
      bookingId: "b1",
      cancellationKind: null,
      actorId: null,
    });
    expect(res.recovered).toBe(true);
  });
});

describe("isCancellationKind", () => {
  it.each(["organizer_cancelled", "platform_cancelled", "user_cancelled", "no_show", "fraud", "other"])(
    "accepts %s",
    (k) => {
      expect(isCancellationKind(k)).toBe(true);
    },
  );
  it("rejects unknown", () => {
    expect(isCancellationKind("weird")).toBe(false);
    expect(isCancellationKind(null)).toBe(false);
    expect(isCancellationKind(undefined)).toBe(false);
  });
});
