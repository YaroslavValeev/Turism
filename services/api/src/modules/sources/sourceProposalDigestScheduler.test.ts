import type { Env } from "@mywave/config";
import { afterEach, describe, expect, it, vi } from "vitest";

const claimDailyRunMock = vi.hoisted(() => vi.fn().mockResolvedValue({ jobKey: "source-proposal-digest", dayKey: "2026-8-30", leaseToken: "lease" }));
const completeDailyRunMock = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
const failDailyRunMock = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
const sendPendingSourceProposalDigestMock = vi.hoisted(() => vi.fn().mockResolvedValue({ status: "skipped" }));

vi.mock("../ingestion/dailyRunLock", () => ({
  claimDailyRun: claimDailyRunMock,
  completeDailyRun: completeDailyRunMock,
  failDailyRun: failDailyRunMock,
}));
vi.mock("./sourceProposalDigest", () => ({ sendPendingSourceProposalDigest: sendPendingSourceProposalDigestMock }));

import { startSourceProposalDigestScheduler } from "./sourceProposalDigestScheduler";

describe("startSourceProposalDigestScheduler", () => {
  afterEach(() => vi.clearAllMocks());

  it("runs only the digest under its own durable daily job key", async () => {
    const env = {
      SOURCE_PROPOSAL_DIGEST_DAILY_ENABLED: true,
      SOURCE_PROPOSAL_DIGEST_DAILY_HOUR_LOCAL: 0,
    } as Env;
    startSourceProposalDigestScheduler(env);
    await new Promise<void>((resolve) => setImmediate(resolve));

    expect(claimDailyRunMock).toHaveBeenCalledWith(expect.any(String), expect.any(Date), "source-proposal-digest");
    expect(sendPendingSourceProposalDigestMock).toHaveBeenCalledWith(env, expect.any(Date));
    expect(completeDailyRunMock).toHaveBeenCalledOnce();
  });

  it("does nothing when the dedicated digest scheduler is disabled", async () => {
    startSourceProposalDigestScheduler({ SOURCE_PROPOSAL_DIGEST_DAILY_ENABLED: false } as Env);
    await new Promise<void>((resolve) => setImmediate(resolve));
    expect(claimDailyRunMock).not.toHaveBeenCalled();
    expect(sendPendingSourceProposalDigestMock).not.toHaveBeenCalled();
  });
});
