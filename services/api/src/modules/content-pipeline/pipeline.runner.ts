import { randomUUID } from "crypto";
import { runDedupJob, runIngestionJob, runNormalizationJob } from "../ingestion/service";
import { runContentDraftGenerationJob } from "./draft.service";
import { safeError } from "../../lib/safeLogger";

export type ContentPipelineRunOptions = {
  /** Ограничить collect/normalize/dedup этими источниками; пусто = все активные */
  sourceIds?: string[];
  /** Лимит content items на шаге draft */
  draftLimit?: number;
  contentItemIdsForDrafts?: string[];
};

export type ContentPipelineRunResult = {
  runId: string;
  steps: Array<{ name: string; ok: boolean; detail?: string }>;
  stoppedAt?: string;
  collect?: unknown;
  normalize?: unknown;
  dedup?: unknown;
  drafts?: unknown;
};

/**
 * Единый автоматический контур: collect → normalize → dedup → draft.
 * Owner review и publish — только вручную (Telegram / админ), без auto-send.
 */
export async function runContentPipeline(
  actorId: string | null,
  options: ContentPipelineRunOptions = {},
): Promise<ContentPipelineRunResult> {
  const runId = randomUUID();
  const steps: ContentPipelineRunResult["steps"] = [];
  const log = (name: string, msg: string) => {
    console.log(`[content-pipeline runId=${runId}] ${name}: ${msg}`);
  };

  let collect: unknown;
  let normalize: unknown;
  let dedup: unknown;
  let drafts: unknown;

  try {
    log("collect", "start");
    collect = await runIngestionJob(actorId, options.sourceIds);
    steps.push({ name: "collect", ok: true, detail: JSON.stringify(collect).slice(0, 2000) });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    safeError("pipeline.collect", e);
    steps.push({ name: "collect", ok: false, detail: msg });
    return { runId, steps, stoppedAt: "collect", collect };
  }

  try {
    log("normalize", "start");
    normalize = await runNormalizationJob(actorId, options.sourceIds);
    steps.push({ name: "normalize", ok: true, detail: JSON.stringify(normalize).slice(0, 2000) });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    safeError("pipeline.normalize", e);
    steps.push({ name: "normalize", ok: false, detail: msg });
    return { runId, steps, stoppedAt: "normalize", collect, normalize };
  }

  try {
    log("dedup", "start");
    dedup = await runDedupJob(actorId, options.sourceIds);
    steps.push({ name: "dedup", ok: true, detail: JSON.stringify(dedup).slice(0, 2000) });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    safeError("pipeline.dedup", e);
    steps.push({ name: "dedup", ok: false, detail: msg });
    return { runId, steps, stoppedAt: "dedup", collect, normalize, dedup };
  }

  try {
    log("draft", "start");
    drafts = await runContentDraftGenerationJob(actorId, {
      contentItemIds: options.contentItemIdsForDrafts,
      limit: options.draftLimit,
    });
    steps.push({ name: "draft", ok: true, detail: JSON.stringify(drafts).slice(0, 2000) });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    safeError("pipeline.draft", e);
    steps.push({ name: "draft", ok: false, detail: msg });
    return { runId, steps, stoppedAt: "draft", collect, normalize, dedup, drafts };
  }

  log("done", "owner_review_and_publish are manual");
  return { runId, steps, collect, normalize, dedup, drafts };
}
