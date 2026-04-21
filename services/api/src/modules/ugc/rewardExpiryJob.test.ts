import { describe, it, expect, vi, beforeEach } from "vitest";
import { runRewardExpiryJob } from "./rewardExpiryJob";

vi.mock("../notifications/sendChannels", () => ({
  sendNotificationEmail: vi.fn(async () => ({ ok: true })),
}));

const mkEnv = (): Parameters<typeof runRewardExpiryJob>[1] =>
  ({
    REFERRAL_REWARD_EXPIRY_REMINDER_WINDOW_DAYS: 7,
    REFERRAL_REWARD_REMINDER_MIN_AGE_DAYS: 7,
  }) as Parameters<typeof runRewardExpiryJob>[1];

describe("runRewardExpiryJob", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns zero when no candidates", async () => {
    const prisma = {
      userReward: {
        findMany: vi.fn(async () => []),
      },
      $transaction: vi.fn(),
    } as unknown as Parameters<typeof runRewardExpiryJob>[0];
    const out = await runRewardExpiryJob(prisma, mkEnv());
    expect(out).toEqual({
      expired: 0,
      candidates: 0,
      reminders_sent: 0,
      reminder_candidates: 0,
    });
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(prisma.userReward.findMany).toHaveBeenCalledTimes(2);
  });

  it("expires only rows with successful updateMany; audit once per expiry", async () => {
    const auditCreates: unknown[] = [];
    let updateAttempt = 0;
    const tx = {
      userReward: {
        updateMany: vi.fn(async () => {
          updateAttempt += 1;
          return updateAttempt === 1 ? { count: 0 } : { count: 1 };
        }),
      },
      auditLog: {
        create: vi.fn(async (args: { data: unknown }) => {
          auditCreates.push(args.data);
          return {};
        }),
      },
    };
    const prisma = {
      userReward: {
        findMany: vi
          .fn()
          .mockResolvedValueOnce([]) // reminders
          .mockResolvedValueOnce([{ id: "a" }, { id: "b" }]), // expiry
      },
      $transaction: vi.fn(async (fn: (t: typeof tx) => Promise<boolean>) => fn(tx)),
    } as unknown as Parameters<typeof runRewardExpiryJob>[0];

    const out = await runRewardExpiryJob(prisma, mkEnv());
    expect(out.candidates).toBe(2);
    expect(out.expired).toBe(1);
    expect(out.reminders_sent).toBe(0);
    expect(tx.auditLog.create).toHaveBeenCalledTimes(1);
    const row = auditCreates[0] as { reason?: string; newValue?: string };
    expect(row.reason).toBe("expires_at_reached");
    expect(row.newValue).toBe("expired");
  });
});
