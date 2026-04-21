import { describe, it, expect } from "vitest";
import { canUseReferralCode } from "./abuseService";

function mkEnv(max = 20): Parameters<typeof canUseReferralCode>[1] {
  return {
    REFERRAL_MAX_BOOKINGS_PER_DAY: max,
  } as Parameters<typeof canUseReferralCode>[1];
}

function mkPrisma(opts: {
  ref: { code: string; ownerEmail: string | null; ownerUserId: string | null } | null;
  bookingWithSameEmail?: { id: string } | null;
  recentCount?: number;
}): Parameters<typeof canUseReferralCode>[0] {
  return {
    referralCode: {
      findUnique: async () => opts.ref ?? null,
    },
    booking: {
      findFirst: async () => opts.bookingWithSameEmail ?? null,
      count: async () => opts.recentCount ?? 0,
    },
  } as unknown as Parameters<typeof canUseReferralCode>[0];
}

describe("canUseReferralCode", () => {
  const input = { code: "MW-ABCDEFGH", email: "alice@example.com", userId: null, programId: "p1" };

  it("rejects unknown code", async () => {
    const res = await canUseReferralCode(mkPrisma({ ref: null }), mkEnv(), input);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toBe("duplicate_use_blocked");
  });

  it("blocks self-use by email", async () => {
    const res = await canUseReferralCode(
      mkPrisma({ ref: { code: "MW-ABCDEFGH", ownerEmail: "Alice@Example.com", ownerUserId: null } }),
      mkEnv(),
      input,
    );
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toBe("self_use_blocked");
  });

  it("blocks self-use by userId", async () => {
    const res = await canUseReferralCode(
      mkPrisma({ ref: { code: "MW-ABCDEFGH", ownerEmail: null, ownerUserId: "u1" } }),
      mkEnv(),
      { ...input, userId: "u1" },
    );
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toBe("self_use_blocked");
  });

  it("blocks duplicate when email already used code", async () => {
    const res = await canUseReferralCode(
      mkPrisma({
        ref: { code: "MW-ABCDEFGH", ownerEmail: "bob@example.com", ownerUserId: null },
        bookingWithSameEmail: { id: "b1" },
      }),
      mkEnv(),
      input,
    );
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toBe("duplicate_use_blocked");
  });

  it("rate-limits when recent bookings >= max", async () => {
    const res = await canUseReferralCode(
      mkPrisma({
        ref: { code: "MW-ABCDEFGH", ownerEmail: "bob@example.com", ownerUserId: null },
        recentCount: 20,
      }),
      mkEnv(20),
      input,
    );
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toBe("rate_limited");
  });

  it("accepts when all checks pass", async () => {
    const res = await canUseReferralCode(
      mkPrisma({
        ref: { code: "MW-ABCDEFGH", ownerEmail: "bob@example.com", ownerUserId: null },
        recentCount: 0,
      }),
      mkEnv(20),
      input,
    );
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.code).toBe("MW-ABCDEFGH");
  });
});
