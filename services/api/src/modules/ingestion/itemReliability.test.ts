import { describe, expect, it, vi } from "vitest";
import { runReliableItemBatch } from "./itemReliability";

describe("runReliableItemBatch", () => {
  it("continues after one item fails and records the failed item", async () => {
    const runItem = vi.fn(async (id: string) => {
      if (id === "bad") throw new Error("invalid payload");
    });
    const recordFailure = vi.fn(async () => undefined);

    await expect(runReliableItemBatch(["first", "bad", "last"], runItem, recordFailure)).resolves.toEqual({
      processed: 3,
      succeeded: 2,
      failed: 1,
      failedItemIds: ["bad"],
    });
    expect(runItem).toHaveBeenCalledTimes(3);
    expect(recordFailure).toHaveBeenCalledWith("bad", expect.any(Error));
  });

  it("fails the job after recording every item when all items fail", async () => {
    const recordFailure = vi.fn(async () => undefined);

    await expect(
      runReliableItemBatch(
        ["bad-1", "bad-2"],
        async () => {
          throw new Error("invalid payload");
        },
        recordFailure,
      ),
    ).rejects.toMatchObject({
      code: "NORMALIZATION_ALL_ITEMS_FAILED",
      stats: { processed: 2, succeeded: 0, failed: 2, failedItemIds: ["bad-1", "bad-2"] },
    });
    expect(recordFailure).toHaveBeenCalledTimes(2);
  });
});
