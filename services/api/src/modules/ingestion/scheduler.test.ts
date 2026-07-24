import type { Env } from "@mywave/config";
import { afterEach, describe, expect, it, vi } from "vitest";

const runDailySyncJobMock = vi.hoisted(() => vi.fn().mockResolvedValue({ scope: "sources:0" }));
const claimDailyRunMock = vi.hoisted(() =>
  vi.fn().mockResolvedValue({ jobKey: "ingestion-daily-sync", dayKey: "2026-7-24", leaseToken: "lease" }),
);
const completeDailyRunMock = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
const failDailyRunMock = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));

vi.mock("./service", () => ({ runDailySyncJob: runDailySyncJobMock }));
vi.mock("./dailyRunLock", () => ({
  claimDailyRun: claimDailyRunMock,
  completeDailyRun: completeDailyRunMock,
  failDailyRun: failDailyRunMock,
}));

import { startIngestionScheduler } from "./scheduler";

describe("startIngestionScheduler", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("forwards safe publish mode and the configured source limit", async () => {
    const env = {
      INGESTION_DAILY_ENABLED: true,
      INGESTION_DAILY_HOUR_LOCAL: 0,
      INGESTION_AUTOPUBLISH_ENABLED: false,
      INGESTION_DAILY_SOURCE_LIMIT: 5,
      INGESTION_DEFAULT_FALLBACK_IMAGE_URL: undefined,
    } as Env;

    startIngestionScheduler(env);
    await new Promise<void>((resolve) => setImmediate(resolve));

    expect(runDailySyncJobMock).toHaveBeenCalledOnce();
    expect(runDailySyncJobMock).toHaveBeenCalledWith("system", {
      autoPublishEnabled: false,
      fallbackImageUrl: undefined,
      sourceLimit: 5,
    });
    expect(completeDailyRunMock).toHaveBeenCalledOnce();
  });

  it("skips the pipeline when another process already owns the daily run", async () => {
    claimDailyRunMock.mockResolvedValueOnce(null);
    const env = {
      INGESTION_DAILY_ENABLED: true,
      INGESTION_DAILY_HOUR_LOCAL: 0,
      INGESTION_AUTOPUBLISH_ENABLED: false,
      INGESTION_DAILY_SOURCE_LIMIT: 1,
      INGESTION_DEFAULT_FALLBACK_IMAGE_URL: undefined,
    } as Env;

    startIngestionScheduler(env);
    await new Promise<void>((resolve) => setImmediate(resolve));

    expect(runDailySyncJobMock).not.toHaveBeenCalled();
    expect(completeDailyRunMock).not.toHaveBeenCalled();
  });
});
