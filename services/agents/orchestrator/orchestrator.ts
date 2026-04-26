import { randomUUID } from "node:crypto";
import { runAnalyticsSnapshot } from "../analytics/agent.js";
import { runMarketingAgent } from "../marketing/agent.js";
import { summarizeSignals } from "../analytics/signals.js";
import { loadMemory, type AgentMemory } from "../memory/store.js";
import { sendToTelegram } from "../shared/telegram.js";
import { splitTelegramMessage } from "../analytics/formatter.js";
import { loadOrchestratorConfig } from "./config.js";
import { saveRun, type OrchestratorRunRecord, listRunRecords } from "./runs/registry.js";
import type { MarketingPlan } from "../marketing/validator.js";
import { isTopicBlockedByMemory, filterStrongActionsOnly } from "./scalingRules.js";
import { appendDecisionLog, readAllDecisionLogEntries } from "./decision-log/log.js";
import { computeOrchestratorWindowMetrics, formatObservabilityV2Line } from "./observabilityV2.js";
import { computeObservabilityV3, formatObservabilityV3Line } from "./observabilityV3.js";
import { applyLearningLayerWithOutcomes } from "./learningLayer.js";
import { loadLearningLimits } from "../shared/learningLimits.js";
import { recordTopicsProposed, loadTopicOutcomes } from "../memory/topicOutcomes.js";

function applyMemoryToPlan(plan: MarketingPlan, memory: AgentMemory): MarketingPlan {
  const actions = plan.actions.filter((a) => !isTopicBlockedByMemory(a.topic, memory));
  return { ...plan, actions };
}

function toControlMessage(plan: MarketingPlan, runId: string): string {
  const lines: string[] = [];
  lines.push(`🧠 Orchestrator · daily run ${runId}`);
  lines.push("");
  lines.push(`CONFIDENCE: ${plan.confidence.toFixed(2)}`);
  lines.push("");
  lines.push("TOP:");
  if (plan.top.length === 0) lines.push("- нет сильных сигналов");
  else for (const t of plan.top) lines.push(`- ${t}`);
  lines.push("");
  lines.push("ACTIONS:");
  if (plan.actions.length === 0) lines.push("- нет новых действий");
  else {
    for (const a of plan.actions) {
      lines.push(`- [${a.type}] ${a.topic} (source: ${a.source})`);
    }
  }
  lines.push("");
  lines.push(`NOTES: ${plan.notes || "—"}`);
  lines.push("");
  lines.push("CONTROL (lifecycle: pending → approved → executed → evaluated):");
  lines.push(`- 👍 /approve ${runId}`);
  lines.push(`- 🛠 /executed ${runId}  (черновик/артефакт зафиксирован)`);
  lines.push(`- 📈 /evaluated ${runId}  (оценка по заявкам, обновит memory)`);
  lines.push(`- ❌ /reject ${runId}`);
  lines.push(`- ✏️ /rewrite ${runId} <комментарий>`);
  lines.push("Инфо: /status runId, /history тема, /top");
  lines.push("Автопубликация отключена. Только рекомендации.");
  return lines.join("\n");
}

function signalsForRegistry(
  summary: ReturnType<typeof summarizeSignals>,
  maxStrong: number
): import("../analytics/signals.js").SignalRow[] {
  return [...summary.strong.slice(0, maxStrong), ...summary.weak];
}

async function logProposedForRun(
  runId: string,
  ac: { topic: string; source: string; signal: import("../analytics/signals.js").SignalStrength }[]
): Promise<void> {
  const ts = new Date().toISOString();
  for (const c of ac) {
    await appendDecisionLog({
      ts,
      runId,
      topic: c.topic,
      source: c.source,
      signal: c.signal,
      decision: "proposed",
      result: "pending",
    });
  }
}

export async function runDailyFlow(): Promise<void> {
  const limits = loadOrchestratorConfig();
  const runId = randomUUID();
  const t0 = Date.now();

  const snapshot = await runAnalyticsSnapshot();
  const summary = summarizeSignals(snapshot.signals);
  const strongCapped = summary.strong.slice(0, limits.maxStrongSignals);
  const signalsForRun = signalsForRegistry(summary, limits.maxStrongSignals);

  const emptyPlan = (notes: string): MarketingPlan => ({
    top: [],
    actions: [],
    notes,
    confidence: 0,
  });

  if (snapshot.totals.totalBookings === 0) {
    const plan = emptyPlan("Нет данных — требуется трафик");
    const record: OrchestratorRunRecord = {
      runId,
      timestamp: new Date().toISOString(),
      analyticsSnapshot: snapshot,
      signals: signalsForRun,
      plan,
      actionContext: [],
      status: "pending",
    };
    await saveRun(record);
    await sendToTelegram(
      `🧠 Orchestrator · run ${runId}\n\nНет данных — требуется трафик (totalBookings=0).\n\nCONTROL:\n- /approve ${runId}\n- /reject ${runId}\n- /executed /evaluated — после появления данных и артефактов`
    );
    const durationMs = Date.now() - t0;
    console.log(
      `[orchestrator] runId=${runId} signals=${signalsForRun.length} actions=${plan.actions.length} durationMs=${durationMs}`
    );
    const runs = await listRunRecords();
    console.log(formatObservabilityV2Line(computeOrchestratorWindowMetrics(runs)));
    const logE = await readAllDecisionLogEntries();
    const outcomes = await loadTopicOutcomes();
    console.log(
      formatObservabilityV3Line(
        computeObservabilityV3({ runs, log: logE, outcomes, snapshot })
      )
    );
    return;
  }

  const memory = await loadMemory();

  const rawPlan = await runMarketingAgent({
    strongSignals: strongCapped,
    weakSignals: summary.weak,
    totals: {
      totalBookings: snapshot.totals.totalBookings,
      withEntryPair: snapshot.totals.withEntryPair,
      noEntryTracking: snapshot.data.totals.noEntryTracking,
    },
    memory,
  });

  let plan = applyMemoryToPlan(rawPlan, memory);
  const f = filterStrongActionsOnly(plan, snapshot.signals);
  plan = f.plan;
  let actionContext = f.actionContext;
  const learned = await applyLearningLayerWithOutcomes({
    plan,
    actionContext,
    memory,
    limits: loadLearningLimits(),
    signals: snapshot.signals,
  });
  plan = learned.plan;
  actionContext = learned.actionContext;
  plan = { ...plan, actions: plan.actions.slice(0, limits.maxActionsPerRun) };
  actionContext = actionContext.slice(0, plan.actions.length);
  const record: OrchestratorRunRecord = {
    runId,
    timestamp: new Date().toISOString(),
    analyticsSnapshot: snapshot,
    signals: signalsForRun,
    plan,
    actionContext: actionContext.length > 0 ? actionContext : undefined,
    status: "pending",
  };
  await saveRun(record);
  await logProposedForRun(runId, actionContext);
  await recordTopicsProposed(
    actionContext.map((c) => ({ ...c, confidence: plan.confidence }))
  );

  const msg = toControlMessage(plan, runId);
  const chunks = splitTelegramMessage(msg);
  for (let i = 0; i < chunks.length; i += 1) {
    const prefix = chunks.length > 1 ? `(${i + 1}/${chunks.length})\n` : "";
    await sendToTelegram(prefix + chunks[i]);
  }

  const durationMs = Date.now() - t0;
  const runs = await listRunRecords();
  const logE = await readAllDecisionLogEntries();
  const outcomes = await loadTopicOutcomes();
  console.log(
    `[orchestrator] runId=${runId} signals=${signalsForRun.length} actions=${plan.actions.length} durationMs=${durationMs}`
  );
  console.log(formatObservabilityV2Line(computeOrchestratorWindowMetrics(runs)));
  console.log(
    formatObservabilityV3Line(computeObservabilityV3({ runs, log: logE, outcomes, snapshot }))
  );
}
