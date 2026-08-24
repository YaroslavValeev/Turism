export type SourceBatchStats = {
  attemptedSources: number;
  succeededSources: number;
  failedSources: number;
  failedSourceIds: string[];
  processed: number;
  created: number;
};

export class AllSourcesFailedError extends Error {
  readonly code = "INGESTION_ALL_SOURCES_FAILED";
  constructor(readonly stats: SourceBatchStats) {
    super(`All ${stats.attemptedSources} ingestion sources failed`);
  }
}

export async function runReliableSourceBatch<T extends { processed: number; created: number }>(
  sourceIds: string[],
  runSource: (sourceId: string) => Promise<T>,
): Promise<SourceBatchStats> {
  const stats: SourceBatchStats = {
    attemptedSources: sourceIds.length,
    succeededSources: 0,
    failedSources: 0,
    failedSourceIds: [],
    processed: 0,
    created: 0,
  };
  for (const sourceId of sourceIds) {
    try {
      const result = await runSource(sourceId);
      stats.succeededSources += 1;
      stats.processed += result.processed;
      stats.created += result.created;
    } catch {
      stats.failedSources += 1;
      stats.failedSourceIds.push(sourceId);
    }
  }
  if (stats.attemptedSources > 0 && stats.succeededSources === 0) throw new AllSourcesFailedError(stats);
  return stats;
}
