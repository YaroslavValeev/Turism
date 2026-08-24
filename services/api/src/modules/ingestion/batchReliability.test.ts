import { describe, expect, it, vi } from "vitest";
import { runReliableSourceBatch } from "./batchReliability";

describe("reliable ingestion source batch", () => {
  it("continues after one source failure and reports a partial batch", async () => {
    const runner = vi.fn(async (id: string) => {
      if (id === "source-b") throw new Error("credential redacted");
      return { processed: 2, created: 1 };
    });
    const result = await runReliableSourceBatch(["source-a", "source-b", "source-c"], runner);
    expect(result).toEqual({ attemptedSources: 3, succeededSources: 2, failedSources: 1,
      failedSourceIds: ["source-b"], processed: 4, created: 2 });
    expect(runner).toHaveBeenCalledTimes(3);
  });

  it("throws an aggregate error when every attempted source fails", async () => {
    const runner = vi.fn(async () => { throw new Error("private upstream error"); });
    await expect(runReliableSourceBatch(["source-a", "source-b"], runner)).rejects.toMatchObject({
      code: "INGESTION_ALL_SOURCES_FAILED",
      message: "All 2 ingestion sources failed",
      stats: { attemptedSources: 2, succeededSources: 0, failedSources: 2, failedSourceIds: ["source-a", "source-b"] },
    });
  });

  it("treats an empty batch as a successful no-op", async () => {
    expect(await runReliableSourceBatch([], vi.fn())).toEqual({ attemptedSources: 0, succeededSources: 0,
      failedSources: 0, failedSourceIds: [], processed: 0, created: 0 });
  });
});
