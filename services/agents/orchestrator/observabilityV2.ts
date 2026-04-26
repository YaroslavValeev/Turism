import type { OrchestratorRunRecord, RunStatus } from "./runs/registry.js";

export type OrchestratorWindowMetrics = {
  runCount: number;
  /** Доля STRONG среди всех сигнальных рядов в прогонах (вес: число сигналов). */
  pctStrongOfSignals: number;
  /** Среди прогонов не в pending: доля с «одобрительной» веткой vs rejected. */
  pctApprovedPath: number;
  pctRejected: number;
  byStatus: Record<RunStatus, number>;
  totalSignalRows: number;
  strongRows: number;
  decidedRuns: number;
  approvedPathRuns: number;
  rejectedRuns: number;
};

function isApprovedPath(s: RunStatus): boolean {
  return s === "approved" || s === "executed" || s === "evaluated";
}

export function computeOrchestratorWindowMetrics(runs: OrchestratorRunRecord[]): OrchestratorWindowMetrics {
  const byStatus: Record<RunStatus, number> = {
    pending: 0,
    approved: 0,
    rejected: 0,
    executed: 0,
    evaluated: 0,
  };

  let totalSignalRows = 0;
  let strongRows = 0;

  for (const r of runs) {
    const st = (r.status in byStatus ? r.status : "pending") as RunStatus;
    byStatus[st] += 1;
    for (const s of r.signals) {
      totalSignalRows += 1;
      if (s.signal === "STRONG") strongRows += 1;
    }
  }

  const decidedRuns = runs.filter((r) => r.status !== "pending").length;
  const approvedPathRuns = runs.filter((r) => isApprovedPath(r.status)).length;
  const rejectedRuns = runs.filter((r) => r.status === "rejected").length;

  const denomDecided = approvedPathRuns + rejectedRuns;
  const pctStrongOfSignals = totalSignalRows > 0 ? (100 * strongRows) / totalSignalRows : 0;
  const pctApprovedPath = denomDecided > 0 ? (100 * approvedPathRuns) / denomDecided : 0;
  const pctRejected = denomDecided > 0 ? (100 * rejectedRuns) / denomDecided : 0;

  return {
    runCount: runs.length,
    pctStrongOfSignals,
    pctApprovedPath,
    pctRejected,
    byStatus,
    totalSignalRows,
    strongRows,
    decidedRuns,
    approvedPathRuns,
    rejectedRuns,
  };
}

export function formatObservabilityV2Line(m: OrchestratorWindowMetrics): string {
  return (
    `[orchestrator:metrics] runs=${m.runCount} ` +
    `strongPct=${m.pctStrongOfSignals.toFixed(1)}% (of ${m.totalSignalRows} signal rows) ` +
    `approvedPathPct=${m.pctApprovedPath.toFixed(1)}% ` +
    `rejectedPct=${m.pctRejected.toFixed(1)}% ` +
    `(status: pending=${m.byStatus.pending} approved=${m.byStatus.approved} ` +
    `executed=${m.byStatus.executed} evaluated=${m.byStatus.evaluated} rejected=${m.byStatus.rejected})`
  );
}
