import { runAnalyticsSnapshot } from "../analytics/agent.js";
import { findSignalBySource } from "../analytics/signals.js";
import { appendDecisionLog, type DecisionLogResult } from "./decision-log/log.js";
import { loadRun, updateRunStatus } from "./runs/registry.js";
import { loadMemory, saveMemory } from "../memory/store.js";
import { recordManyEvaluatedTopicOutcomes } from "../memory/topicOutcomes.js";
import { loadLearningLimits } from "../shared/learningLimits.js";
import type { ActionContext } from "./scalingRules.js";

/**
 * Оценка по фактическим заявкам: topic → bookingCount(source) → success | failure
 * + запись в topic_outcomes (runs, successRate, lastResult, калибровка trust).
 */
export async function completeRunWithEvaluation(runId: string): Promise<{ ok: boolean; message: string }> {
  const run = await loadRun(runId);
  if (!run) {
    return { ok: false, message: `Прогон не найден: ${runId}` };
  }
  if (run.status !== "executed") {
    return {
      ok: false,
      message: `Ожидался статус «executed», сейчас «${run.status}» (нужен /executed).`,
    };
  }

  const actionContext: ActionContext[] = run.actionContext?.length
    ? run.actionContext
    : run.plan.actions.map((a) => {
        const row = findSignalBySource(run.signals, a.source);
        return {
          topic: a.topic,
          source: a.source,
          signal: row?.signal ?? "NONE",
        };
      });

  if (actionContext.length === 0) {
    await updateRunStatus(runId, "evaluated");
    await appendDecisionLog({
      ts: new Date().toISOString(),
      runId,
      topic: "—",
      source: "—",
      signal: "NONE",
      decision: "evaluated",
      result: "unknown",
    });
    return { ok: true, message: `Прогон ${runId} помечен evaluated (без тем в плане).` };
  }

  const snapshot = await runAnalyticsSnapshot();
  const mem = await loadMemory();
  const addSuccess: string[] = [];
  const addFailed: string[] = [];
  const cal = loadLearningLimits();
  const learningBatch: Array<{ topic: string; result: "success" | "failure" }> = [];

  for (const c of actionContext) {
    const row = findSignalBySource(snapshot.signals, c.source);
    const bookings = row?.bookingCount ?? 0;
    const topic = c.topic.trim();
    if (!topic) continue;

    const outResult: DecisionLogResult = bookings > 0 ? "success" : "failure";
    if (bookings > 0) addSuccess.push(topic);
    else addFailed.push(topic);

    learningBatch.push({
      topic,
      result: outResult === "success" ? "success" : "failure",
    });

    await appendDecisionLog({
      ts: new Date().toISOString(),
      runId,
      topic,
      source: c.source,
      signal: c.signal,
      decision: "evaluated",
      result: outResult,
    });
  }

  await recordManyEvaluatedTopicOutcomes(
    learningBatch,
    run.plan.confidence,
    cal.calibrationHighConfidence
  );

  const tnorm = (x: string) => x.trim().toLowerCase();
  const failedSet = new Set(addFailed.map(tnorm));
  const successNorm = new Set(addSuccess.map(tnorm));

  const nextSuccessful = dedupe(
    mem.successful_topics
      .filter((t) => !failedSet.has(tnorm(t)))
      .concat(
        addSuccess
          .map((t) => t.trim())
          .filter(Boolean)
      )
  );

  const nextFailed = dedupe(
    mem.failed_topics
      .filter((t) => !successNorm.has(tnorm(t)))
      .concat(
        addFailed
          .map((t) => t.trim())
          .filter(Boolean)
      )
  );

  await saveMemory({
    ...mem,
    successful_topics: nextSuccessful,
    failed_topics: nextFailed,
  });

  const updated = await updateRunStatus(runId, "evaluated");
  if (!updated) {
    return { ok: false, message: "Не удалось обновить статус." };
  }

  return {
    ok: true,
    message: `Run ${runId} → evaluated. Успех по темам: ${addSuccess.length}, без заявок: ${addFailed.length}. Learning stats обновлены.`,
  };
}

function dedupe(items: string[]): string[] {
  return Array.from(new Set(items.map((x) => x.trim()).filter(Boolean)));
}
