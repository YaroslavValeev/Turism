import { describe, it, expect, vi } from "vitest";
import { getGrowthLoopCounters, maybeGrantRewardForApprovedUgc } from "./rewardService";

vi.mock("../notifications/sendChannels", () => ({
  sendNotificationEmail: vi.fn(async () => ({ ok: true })),
}));

vi.mock("../../lib/audit", () => ({
  writeAuditLog: vi.fn(async () => {}),
}));

vi.mock("../economics/guardrailsService", () => ({
  computeGlobalDiscountGuardrail: vi.fn(async () => ({
    mode: "ok" as const,
    valueMultiplierBps: 10000,
    avgDiscountSharePct: 0,
  })),
  combineRewardMultipliersBps: (a: number, b: number) => Math.min(10000, Math.floor((a * b) / 10000)),
}));

function mkPrisma(state: { ugc: Record<string, unknown>; refs: Record<string, unknown> }) {
  return {
    referralCode: {
      create: vi.fn(async ({ data }: { data: { code: string } }) => {
        if (state.refs[data.code]) {
          const err: { code: string } = { code: "P2002" };
          throw err;
        }
        state.refs[data.code] = data;
        return data;
      }),
      count: vi.fn(async () => Object.keys(state.refs).length),
      aggregate: vi.fn(async () => ({ _sum: { visits: 0, bookings: 0 } })),
    },
    program: {
      findUnique: vi.fn(async () => ({
        title: "Test Program",
        economicsRewardSuspended: false,
        economicsRewardMultiplierBps: 10000,
        economicsOverrideMode: null,
        economicsOverrideUntil: null,
      })),
    },
    booking: {
      count: vi.fn(async () => 0),
      aggregate: vi.fn(async () => ({ _sum: { originalAmountRub: 0, discountAmountRub: 0 } })),
    },
    programUgc: {
      update: vi.fn(async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        const cur = state.ugc[where.id] as Record<string, unknown>;
        state.ugc[where.id] = { ...cur, ...data };
        return state.ugc[where.id];
      }),
      count: vi.fn(async () => 0),
    },
    userReward: {
      findFirst: vi.fn(async () => null),
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => data),
      count: vi.fn(async () => 0),
    },
    referralAbuseEvent: {
      count: vi.fn(async () => 0),
    },
  } as unknown as Parameters<typeof maybeGrantRewardForApprovedUgc>[0];
}

const env = {
  NOTIFICATIONS_SITE_BASE_URL: "http://localhost:3000",
  REFERRAL_REWARD_VALUE: 5,
  REFERRAL_REWARD_VALUE_TYPE: "percent",
  REFERRAL_REWARD_VALIDITY_DAYS: 365,
  REFERRAL_REWARD_EXPIRY_REMINDER_WINDOW_DAYS: 7,
  REFERRAL_REWARD_REMINDER_MIN_AGE_DAYS: 7,
  ECON_GUARDRAILS_ENABLED: true,
  ECON_MAX_DISCOUNT_SHARE: 25,
  ECON_GUARDRAILS_LOOKBACK_DAYS: 30,
  ECON_GLOBAL_REWARD_ACTION: "reduce" as const,
  ECON_GLOBAL_REWARD_REDUCE_BPS: 5000,
  ECON_MIN_REFERRAL_CONVERSION: 2,
  ECON_REFERRAL_CODE_MIN_VISITS: 20,
  ECON_MIN_COMPLETION_RATE: 10,
  ECON_PROGRAM_RATIO_SOFT: 2,
  ECON_PROGRAM_RATIO_HARD: 3,
  ECON_PROGRAM_RATIO_ZERO: 5,
  ECON_REWARD_MULTIPLIER_SOFT_BPS: 7000,
  ECON_REWARD_MULTIPLIER_HARD_BPS: 5000,
  ECON_REWARD_MULTIPLIER_RECOVERY_STEP_BPS: 1000,
  ECON_EXPIRY_HEALTH_RATIO: 50,
} as unknown as Parameters<typeof maybeGrantRewardForApprovedUgc>[1];

describe("maybeGrantRewardForApprovedUgc", () => {
  it("skips when not approved", async () => {
    const state = { ugc: {}, refs: {} };
    const ugc = {
      id: "u1", moderationStatus: "pending", rewardStatus: "none",
      textReview: "nice", mediaUrls: [], contactEmail: "a@b.c", userId: null,
    } as unknown as Parameters<typeof maybeGrantRewardForApprovedUgc>[2];
    const res = await maybeGrantRewardForApprovedUgc(mkPrisma(state), env, ugc);
    expect(res.granted).toBe(false);
    expect(res.reason).toBe("not_approved");
  });

  it("skips when no text and no media", async () => {
    const state = { ugc: { u1: {} }, refs: {} };
    const ugc = {
      id: "u1", moderationStatus: "approved", rewardStatus: "none",
      textReview: "", mediaUrls: [], contactEmail: "a@b.c", userId: null,
    } as unknown as Parameters<typeof maybeGrantRewardForApprovedUgc>[2];
    const res = await maybeGrantRewardForApprovedUgc(mkPrisma(state), env, ugc);
    expect(res.granted).toBe(false);
    expect(res.reason).toBe("empty_content");
  });

  it("grants and generates referral code for approved + text", async () => {
    const state = { ugc: { u1: {} }, refs: {} };
    const ugc = {
      id: "u1", programId: "p1", moderationStatus: "approved", rewardStatus: "none",
      textReview: "amazing trip", mediaUrls: [], contactEmail: "a@b.c",
      authorName: "Anna", userId: null,
    } as unknown as Parameters<typeof maybeGrantRewardForApprovedUgc>[2];
    const res = await maybeGrantRewardForApprovedUgc(mkPrisma(state), env, ugc);
    expect(res.granted).toBe(true);
    expect(res.referralCode).toMatch(/^MW-[A-Z0-9]{8}$/);
    expect(res.emailSent).toBe(true);
  });

  it("idempotent: already processed", async () => {
    const state = { ugc: {}, refs: {} };
    const ugc = {
      id: "u1", moderationStatus: "approved", rewardStatus: "granted",
      referralCode: "MW-AAAAAAAA", textReview: "x", mediaUrls: [],
      contactEmail: null, userId: null,
    } as unknown as Parameters<typeof maybeGrantRewardForApprovedUgc>[2];
    const res = await maybeGrantRewardForApprovedUgc(mkPrisma(state), env, ugc);
    expect(res.granted).toBe(false);
    expect(res.reason).toBe("already_processed");
    expect(res.referralCode).toBe("MW-AAAAAAAA");
  });
});

describe("getGrowthLoopCounters", () => {
  it("returns 0s on empty prisma", async () => {
    const state = { ugc: {}, refs: {} };
    const out = await getGrowthLoopCounters(mkPrisma(state));
    expect(out.ugc).toEqual({ approved: 0, granted: 0, pending: 0, rejected: 0 });
    expect(out.referrals.visits).toBe(0);
    expect(out.funnel.approved_to_granted_pct).toBe(0);
  });
});
