import type { Env } from "@mywave/config";
import { prisma } from "../../lib/prisma";
import { dqThresholdsFromEnv } from "./dqThresholds";

export type DqHealthGrade = "green" | "warning" | "critical";

export type DqMetricsWindow = {
  windowHours: number;
  ingestionSuccessCount: bigint;
  ingestionErrorCount: bigint;
  invalidPayloadCount: bigint;
  missingRequiredParamsCount: bigint;
  duplicateEventCount: bigint;
  lateEventCount: bigint;
  orphanBookingEventCount: bigint;
  orphanPaymentEventCount: bigint;
  orphanRefundEventCount: bigint;
  martRefreshSuccessCount: bigint;
  martRefreshFailureCount: bigint;
  dataFreshnessLagSeconds: bigint;
  martFreshnessLagSeconds: bigint;
  criticalBackendEventCount: bigint;
  overallGrade: DqHealthGrade;
  issues: string[];
};

function gradeFromIssues(issues: string[]): DqHealthGrade {
  const critical = issues.filter((i) => i.startsWith("critical:")).length;
  if (critical > 0) return "critical";
  if (issues.length > 0) return "warning";
  return "green";
}

export async function computeDqMetrics(windowHours: number, env: Env): Promise<DqMetricsWindow> {
  const t = dqThresholdsFromEnv(env);
  const baseline = t.eventBaseline;
  const wh = Math.max(1, Math.min(168, windowHours));
  const since = new Date(Date.now() - wh * 3600 * 1000);

  const [
    ingestionSuccess,
    ingestionErrors,
    invalidPayload,
    missingRequired,
    duplicateCount,
    lateRows,
    orphanBookingRows,
    orphanPaymentRows,
    orphanRefundRows,
    martOk,
    martFail,
    maxIngested,
    lastMartSuccess,
    criticalBackend,
  ] = await Promise.all([
    prisma.analyticsEvent.count({ where: { ingestedAt: { gte: since } } }),
    prisma.analyticsEventError.count({ where: { createdAt: { gte: since } } }),
    prisma.analyticsEventError.count({
      where: {
        createdAt: { gte: since },
        reasonCode: { in: ["INVALID_JSON", "UNKNOWN_FIELD"] },
      },
    }),
    prisma.analyticsEventError.count({
      where: {
        createdAt: { gte: since },
        reasonCode: "INVALID_FIELD",
        message: { contains: "required", mode: "insensitive" },
      },
    }),
    prisma.analyticsEventError.count({
      where: {
        createdAt: { gte: since },
        message: { contains: "idempotency_key conflict", mode: "insensitive" },
      },
    }),
    prisma.$queryRawUnsafe<{ c: bigint }[]>(
      `SELECT COUNT(*)::bigint AS c FROM "analytics_events"
       WHERE "ingestedAt" >= NOW() - $1::int * interval '1 hour'
         AND EXTRACT(EPOCH FROM ("ingestedAt" - "eventTime")) > $2`,
      wh,
      t.lateEventLagSec
    ),
    prisma.$queryRawUnsafe<{ c: bigint }[]>(
      `SELECT COUNT(*)::bigint AS c FROM "analytics_events" e
       WHERE e."ingestedAt" >= NOW() - $1::int * interval '1 hour'
         AND e."bookingId" IS NOT NULL
         AND e."eventName" IN ('booking_created','booking_confirmed','booking_canceled')
         AND NOT EXISTS (SELECT 1 FROM "bookings" b WHERE b."id" = e."bookingId")`,
      wh
    ),
    prisma.$queryRawUnsafe<{ c: bigint }[]>(
      `SELECT COUNT(*)::bigint AS c FROM "analytics_events" e
       WHERE e."ingestedAt" >= NOW() - $1::int * interval '1 hour'
         AND e."paymentId" IS NOT NULL
         AND e."eventName" = 'payment_recorded'
         AND NOT EXISTS (SELECT 1 FROM "payments" p WHERE p."id" = e."paymentId")`,
      wh
    ),
    prisma.$queryRawUnsafe<{ c: bigint }[]>(
      `SELECT COUNT(*)::bigint AS c FROM "analytics_events" e
       WHERE e."ingestedAt" >= NOW() - $1::int * interval '1 hour'
         AND e."refundId" IS NOT NULL
         AND e."eventName" = 'refund_recorded'
         AND NOT EXISTS (SELECT 1 FROM "refunds" r WHERE r."id" = e."refundId")`,
      wh
    ),
    prisma.analyticsMartRefreshLog.count({
      where: { createdAt: { gte: since }, status: "success" },
    }),
    prisma.analyticsMartRefreshLog.count({
      where: { createdAt: { gte: since }, status: "failure" },
    }),
    prisma.analyticsEvent.aggregate({ _max: { ingestedAt: true } }),
    prisma.analyticsMartRefreshLog.findFirst({
      where: { status: "success" },
      orderBy: { createdAt: "desc" },
      select: { createdAt: true },
    }),
    prisma.analyticsEvent.count({
      where: {
        ingestedAt: { gte: since },
        eventSource: { in: ["backend", "system"] },
        eventName: {
          in: ["booking_created", "payment_recorded", "refund_recorded", "commission_accrued"],
        },
      },
    }),
  ]);

  const now = Date.now();
  const maxIn = maxIngested._max.ingestedAt;
  const pipelineLagSec =
    maxIn != null ? BigInt(Math.max(0, Math.floor((now - maxIn.getTime()) / 1000))) : BigInt(86400 * 365);

  const martLagSec =
    lastMartSuccess != null
      ? BigInt(Math.max(0, Math.floor((now - lastMartSuccess.createdAt.getTime()) / 1000)))
      : BigInt(86400 * 365);

  const lateRow = lateRows[0]?.c ?? 0n;
  const ob = orphanBookingRows[0]?.c ?? 0n;
  const op = orphanPaymentRows[0]?.c ?? 0n;
  const orf = orphanRefundRows[0]?.c ?? 0n;

  const maxLag = t.maxPipelineLagSec;
  const warnLag = Math.max(60, Math.floor(maxLag / 3));

  const issues: string[] = [];
  if (ingestionErrors > t.ingestionErrorsCritical) {
    issues.push(`critical:ingestion_errors_high(${ingestionErrors})`);
  } else if (ingestionErrors > t.ingestionErrorsWarning) {
    issues.push(`warning:ingestion_errors(${ingestionErrors})`);
  }

  if (ingestionSuccess > 0 && Number(pipelineLagSec) > maxLag) {
    issues.push(`critical:pipeline_freshness_lag_s=${pipelineLagSec.toString()}`);
  } else if (ingestionSuccess > 0 && Number(pipelineLagSec) > warnLag) {
    issues.push(`warning:pipeline_freshness_lag_s=${pipelineLagSec.toString()}`);
  }

  if (martFail > 0) issues.push(`critical:mart_refresh_failure_count=${martFail}`);
  if (duplicateCount > t.duplicateWarning) {
    issues.push(`warning:duplicate_idempotency_conflicts=${duplicateCount}`);
  }

  if (ingestionSuccess < baseline && ingestionSuccess > 0) {
    issues.push(`warning:event_volume_below_baseline(${ingestionSuccess}<${baseline})`);
  }
  if (ingestionSuccess === 0) {
    issues.push("warning:no_analytics_events_in_window");
  }

  if (ob > 0n || op > 0n || orf > 0n) {
    issues.push(`warning:orphan_events booking=${ob.toString()} payment=${op.toString()} refund=${orf.toString()}`);
  }

  return {
    windowHours: wh,
    ingestionSuccessCount: BigInt(ingestionSuccess),
    ingestionErrorCount: BigInt(ingestionErrors),
    invalidPayloadCount: BigInt(invalidPayload),
    missingRequiredParamsCount: BigInt(missingRequired),
    duplicateEventCount: BigInt(duplicateCount),
    lateEventCount: lateRow,
    orphanBookingEventCount: ob,
    orphanPaymentEventCount: op,
    orphanRefundEventCount: orf,
    martRefreshSuccessCount: BigInt(martOk),
    martRefreshFailureCount: BigInt(martFail),
    dataFreshnessLagSeconds: pipelineLagSec,
    martFreshnessLagSeconds: martLagSec,
    criticalBackendEventCount: BigInt(criticalBackend),
    overallGrade: gradeFromIssues(issues),
    issues,
  };
}
