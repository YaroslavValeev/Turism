export type ItemBatchStats = {
  processed: number;
  succeeded: number;
  failed: number;
  failedItemIds: string[];
};

export class AllItemsFailedError extends Error {
  readonly code = "NORMALIZATION_ALL_ITEMS_FAILED";

  constructor(readonly stats: ItemBatchStats) {
    super(`All ${stats.processed} normalization items failed`);
  }
}

export async function runReliableItemBatch(
  itemIds: string[],
  runItem: (itemId: string) => Promise<void>,
  recordFailure: (itemId: string, error: unknown) => Promise<void>,
): Promise<ItemBatchStats> {
  const stats: ItemBatchStats = { processed: itemIds.length, succeeded: 0, failed: 0, failedItemIds: [] };

  for (const itemId of itemIds) {
    try {
      await runItem(itemId);
      stats.succeeded += 1;
    } catch (error) {
      stats.failed += 1;
      stats.failedItemIds.push(itemId);
      await recordFailure(itemId, error);
    }
  }

  if (stats.processed > 0 && stats.succeeded === 0) throw new AllItemsFailedError(stats);
  return stats;
}
