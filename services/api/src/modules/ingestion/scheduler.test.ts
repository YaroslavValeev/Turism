import type { Env } from "@mywave/config";
import { afterEach, describe, expect, it, vi } from "vitest";

const runDailySyncJobMock = vi.hoisted(() => vi.fn().mockResolvedValue({ scope: "sources:0" }));

vi.mock("./service", () => ({ runDailySyncJob: runDailySyncJobMock }));

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
  });
});
