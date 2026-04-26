import type { OrchestratorRunRecord } from "./runs/registry.js";
import type { AnalyticsSnapshot } from "../analytics/agent.js";
import type { DecisionLogEntry } from "./decision-log/log.js";
import type { TopicOutcomeRecord } from "../memory/topicOutcomes.js";
import { topicKeyOf } from "../memory/topicOutcomes.js";

export type LearningSystemKpis = {
  meanTopicSuccessRate: number;
  bySignal: Map<string, { n: number; successWeight: number }>;
  byEntryTypeBookings: Map<string, number>;
  evaluatedSuccessPct: number;
  rejectedRunPct: number;
  topicRepeatRatePct: number;
};

function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

export function computeObservabilityV3(args: {
  runs: OrchestratorRunRecord[];
  log: DecisionLogEntry[];
  outcomes: TopicOutcomeRecord[];
  snapshot: AnalyticsSnapshot | null;
}): LearningSystemKpis {
  const { runs, log, outcomes, snapshot } = args;

  const rates = outcomes.filter((o) => o.runs > 0).map((o) => o.successRate);
  const meanTopicSuccessRate = mean(rates);

  const bySignal = new Map<string, { n: number; successWeight: number }>();
  for (const o of outcomes) {
    if (!o.signalOnLastRun || o.runs === 0) continue;
    const k = o.signalOnLastRun;
    const p = bySignal.get(k) ?? { n: 0, successWeight: 0 };
    p.n += 1;
    p.successWeight += o.successRate;
    bySignal.set(k, p);
  }

  const byEntryTypeBookings = new Map<string, number>();
  if (snapshot?.data?.rows) {
    for (const r of snapshot.data.rows) {
      const et = r.entryType || "—";
      byEntryTypeBookings.set(et, (byEntryTypeBookings.get(et) ?? 0) + r.bookingCount);
    }
  }

  const ev = log.filter(
    (e) => e.decision === "evaluated" && (e.result === "success" || e.result === "failure")
  );
  const evOk = ev.filter((e) => e.result === "success").length;
  const evaluatedSuccessPct = ev.length > 0 ? (100 * evOk) / ev.length : 0;

  const decided = runs.filter((r) => r.status !== "pending");
  const rej = runs.filter((r) => r.status === "rejected");
  const rejectedRunPct = decided.length > 0 ? (100 * rej.length) / decided.length : 0;

  const prop = log.filter((e) => e.decision === "proposed");
  const perTopic = new Map<string, number>();
  for (const p of prop) {
    const k2 = topicKeyOf(p.topic);
    if (!k2) continue;
    perTopic.set(k2, (perTopic.get(k2) ?? 0) + 1);
  }
  const withRepeat = Array.from(perTopic.values()).filter((c) => c > 1).length;
  const topicRepeatRatePct = perTopic.size > 0 ? (100 * withRepeat) / perTopic.size : 0;

  return {
    meanTopicSuccessRate: meanTopicSuccessRate,
    bySignal,
    byEntryTypeBookings,
    evaluatedSuccessPct,
    rejectedRunPct,
    topicRepeatRatePct: Number.isFinite(topicRepeatRatePct) ? topicRepeatRatePct : 0,
  };
}

export function formatObservabilityV3Line(k: LearningSystemKpis): string {
  const sig = [...k.bySignal.entries()]
    .map(([sig, v]) => {
      const m = v.n > 0 ? (v.successWeight / v.n) * 100 : 0;
      return `${sig}=${m.toFixed(0)}%`;
    })
    .join(" ");
  const et = [...k.byEntryTypeBookings.entries()]
    .map(([a, b]) => `${a}=${b}`)
    .join(",");
  return (
    `[orchestrator:learningKpi] ` +
    `topicSR_mean=${(k.meanTopicSuccessRate * 100).toFixed(0)}% ` +
    (sig ? `bySignal[${sig}] ` : "") +
    (et ? `bookingsByType[${et}] ` : "") +
    `evalOK=${k.evaluatedSuccessPct.toFixed(0)}% ` +
    `rejectedRuns=${k.rejectedRunPct.toFixed(0)}% ` +
    `topicMultiProp=${k.topicRepeatRatePct.toFixed(0)}%`
  );
}
