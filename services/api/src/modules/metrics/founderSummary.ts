import { prisma } from "../../lib/prisma";
import { computeDqMetrics, type DqMetricsWindow } from "../analytics/dqMetrics";
import { getApiEnv } from "../analytics/runtimeEnv";

function bigintify(m: DqMetricsWindow): Record<string, unknown> {
  const n = (b: bigint) => Number(b);
  return {
    windowHours: m.windowHours,
    ingestionSuccessCount: n(m.ingestionSuccessCount),
    ingestionErrorCount: n(m.ingestionErrorCount),
    invalidPayloadCount: n(m.invalidPayloadCount),
    missingRequiredParamsCount: n(m.missingRequiredParamsCount),
    duplicateEventCount: n(m.duplicateEventCount),
    lateEventCount: n(m.lateEventCount),
    orphanBookingEventCount: n(m.orphanBookingEventCount),
    orphanPaymentEventCount: n(m.orphanPaymentEventCount),
    orphanRefundEventCount: n(m.orphanRefundEventCount),
    martRefreshSuccessCount: n(m.martRefreshSuccessCount),
    martRefreshFailureCount: n(m.martRefreshFailureCount),
    dataFreshnessLagSeconds: n(m.dataFreshnessLagSeconds),
    martFreshnessLagSeconds: n(m.martFreshnessLagSeconds),
    criticalBackendEventCount: n(m.criticalBackendEventCount),
    overallGrade: m.overallGrade,
    issues: m.issues,
  };
}

async function latestSnapshotsPerOrganizer() {
  const rows = await prisma.organizerScoreSnapshot.findMany({
    orderBy: { recalculatedAt: "desc" },
    take: 2000,
  });
  const best = new Map<string, (typeof rows)[0]>();
  for (const r of rows) {
    if (!best.has(r.organizerId)) best.set(r.organizerId, r);
  }
  return [...best.values()];
}

async function latestSnapshotsPerProgram() {
  const rows = await prisma.programScoreSnapshot.findMany({
    orderBy: { recalculatedAt: "desc" },
    take: 4000,
  });
  const best = new Map<string, (typeof rows)[0]>();
  for (const r of rows) {
    if (!best.has(r.programId)) best.set(r.programId, r);
  }
  return [...best.values()];
}

function avg(nums: number[]): number {
  if (!nums.length) return 0;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

export async function buildFounderSummary() {
  const dq = await computeDqMetrics(24, getApiEnv());
  const dqSerialized = bigintify(dq);

  const orgSnaps = await latestSnapshotsPerOrganizer();
  const progSnaps = await latestSnapshotsPerProgram();

  const orgScores = orgSnaps.map((s) => s.organizerScore);
  const progTotals = progSnaps.map((s) => s.totalProgramScore);

  const weakOrganizers = [...orgSnaps]
    .filter((s) => s.scoreBand !== "unknown")
    .sort((a, b) => a.organizerScore - b.organizerScore)
    .slice(0, 5)
    .map((s) => ({
      organizerId: s.organizerId,
      organizerScore: s.organizerScore,
      scoreBand: s.scoreBand,
      recalculatedAt: s.recalculatedAt.toISOString(),
    }));

  const weakPrograms = [...progSnaps]
    .filter((s) => s.scoreBand !== "insufficient_data" && s.scoreBand !== "unknown")
    .sort((a, b) => a.totalProgramScore - b.totalProgramScore)
    .slice(0, 5)
    .map((s) => ({
      programId: s.programId,
      totalProgramScore: s.totalProgramScore,
      scoreBand: s.scoreBand,
      recalculatedAt: s.recalculatedAt.toISOString(),
    }));

  const weekAgo = new Date(Date.now() - 7 * 24 * 3600 * 1000);
  const orgSnapsOld = await prisma.organizerScoreSnapshot.findMany({
    where: { recalculatedAt: { lte: weekAgo } },
    orderBy: { recalculatedAt: "desc" },
    take: 2000,
  });
  const bestOld = new Map<string, (typeof orgSnapsOld)[0]>();
  for (const r of orgSnapsOld) {
    if (!bestOld.has(r.organizerId)) bestOld.set(r.organizerId, r);
  }
  const oldOrgVals = [...bestOld.values()].map((s) => s.organizerScore);
  const oldOrgAvg = oldOrgVals.length ? avg(oldOrgVals) : 0;
  const curOrgAvg = orgScores.length ? avg(orgScores) : 0;
  const organizerScoreWowDelta = oldOrgVals.length ? curOrgAvg - oldOrgAvg : 0;

  const progSnapsOld = await prisma.programScoreSnapshot.findMany({
    where: { recalculatedAt: { lte: weekAgo } },
    orderBy: { recalculatedAt: "desc" },
    take: 4000,
  });
  const bestProgOld = new Map<string, (typeof progSnapsOld)[0]>();
  for (const r of progSnapsOld) {
    if (!bestProgOld.has(r.programId)) bestProgOld.set(r.programId, r);
  }
  const oldProgVals = [...bestProgOld.values()].map((s) => s.totalProgramScore);
  const oldProgAvg = oldProgVals.length ? avg(oldProgVals) : 0;
  const curProgAvg = progTotals.length ? avg(progTotals) : 0;
  const programScoreWowDelta = oldProgVals.length ? curProgAvg - oldProgAvg : 0;

  const criticalWarningsCount = dq.issues.filter((i) => i.startsWith("critical:")).length;

  return {
    dq_health_status: dq.overallGrade,
    dq_metrics: dqSerialized,
    data_freshness_lag_seconds: Number(dq.dataFreshnessLagSeconds),
    critical_analytics_warnings_count: criticalWarningsCount,
    organizer_score_summary: {
      average: curOrgAvg,
      sample_organizers: orgSnaps.length,
    },
    program_score_summary: {
      average: curProgAvg,
      sample_programs: progSnaps.length,
    },
    score_movement_week_over_week: {
      organizer_score_delta: organizerScoreWowDelta,
      program_score_delta: programScoreWowDelta,
    },
    top_weak_organizers: weakOrganizers,
    top_weak_programs: weakPrograms,
  };
}
