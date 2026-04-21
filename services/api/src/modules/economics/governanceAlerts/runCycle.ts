/**
 * Governance alerts v1: evaluate из overview/guardrails/audit, дедуп по fingerprint,
 * instant critical (Telegram + email), digest для warning (email).
 */
import { createHash } from "node:crypto";
import type { Env } from "@mywave/config";
import { Prisma, type PrismaClient } from "@prisma/client";
import { sendNotificationEmail, sendNotificationTelegram } from "../../notifications/sendChannels";
import { buildEconomicsOverview } from "../overviewService";
import { getGuardrailsDashboard } from "../guardrailsService";
import { ENTITY_PLATFORM, GOV_ALERT } from "./constants";

function num(v: number | null | undefined): number {
  return v ?? 0;
}

export function makeFingerprint(parts: string[]): string {
  return createHash("sha256").update(parts.join("|")).digest("hex").slice(0, 48);
}

async function upsertOpenAlert(
  db: PrismaClient,
  params: {
    fingerprint: string;
    alertType: string;
    severity: "info" | "warning" | "critical";
    entityType: string;
    entityId: string;
    title: string;
    detail: string;
    payloadJson?: Record<string, unknown>;
  },
): Promise<void> {
  const now = new Date();
  const pj = params.payloadJson === undefined ? undefined : (params.payloadJson as Prisma.InputJsonValue);
  await db.governanceAlert.upsert({
    where: { fingerprint: params.fingerprint },
    create: {
      fingerprint: params.fingerprint,
      alertType: params.alertType,
      severity: params.severity,
      entityType: params.entityType,
      entityId: params.entityId,
      title: params.title,
      detail: params.detail,
      payloadJson: pj,
      firstSeenAt: now,
      lastSeenAt: now,
      status: "open",
    },
    update: {
      lastSeenAt: now,
      severity: params.severity,
      title: params.title,
      detail: params.detail,
      payloadJson: pj,
      status: "open",
    },
  });
}

/** Независимая сумма commission по броням в окне (как в overview). */
async function sumCommissionRubIndependent(
  db: PrismaClient,
  from: Date,
  to: Date,
): Promise<number> {
  const rows = await db.commission.findMany({
    where: { booking: { createdAt: { gte: from, lte: to } } },
    select: { commissionCollectedRub: true, commissionAmountRub: true },
  });
  let t = 0;
  for (const c of rows) {
    t += num(c.commissionCollectedRub) || num(c.commissionAmountRub);
  }
  return t;
}

const GRANT_BLOCKED_24H_CRITICAL = 10;
const FAILED_RUNS_24H_CRITICAL = 5;
const INGESTION_STUCK_SOURCES_WARN = 3;
const CONVERSION_NOTIFY_FAILED_CRITICAL = 5;
const MULTIPLIER_CHURN_DAYS = 7;
const MULTIPLIER_CHURN_MIN_EVENTS = 3;
const MAX_OVERRIDES_WARN = 5;
const DISCOUNT_WOW_RATIO_WARN = 0.2;
const COMPLETION_WEAK_PCT = 15;
const RECOVERY_ORG_RATIO_WARN = 0.5;

export type GovernanceEvaluateResult = {
  evaluated_at: string;
  upserts: number;
  resolved: number;
  critical_delivered: number;
};

/**
 * Один проход: вычислить условия → upsert/resolve → доставить critical при cooldown.
 */
export async function runGovernanceAlertCycle(db: PrismaClient, env: Env): Promise<GovernanceEvaluateResult> {
  if (!env.ECON_GOVERNANCE_ALERTS_ENABLED) {
    return { evaluated_at: new Date().toISOString(), upserts: 0, resolved: 0, critical_delivered: 0 };
  }

  const now = new Date();
  const to = new Date(now);
  to.setUTCHours(23, 59, 59, 999);
  const from7 = new Date(to);
  from7.setUTCDate(from7.getUTCDate() - 7);
  from7.setUTCHours(0, 0, 0, 0);
  const prevTo = new Date(from7);
  prevTo.setMilliseconds(prevTo.getMilliseconds() - 1);
  const from14 = new Date(from7);
  from14.setUTCDate(from14.getUTCDate() - 7);

  let upserts = 0;
  let resolved = 0;

  const period7 = { dateFrom: from7, dateTo: to };
  const periodPrev = { dateFrom: from14, dateTo: prevTo };

  const [overview7, overviewPrev, sumIndependent, dash] = await Promise.all([
    buildEconomicsOverview(db, period7),
    buildEconomicsOverview(db, periodPrev),
    sumCommissionRubIndependent(db, from7, to),
    getGuardrailsDashboard(db, env),
  ]);

  const totalCommOverview = overview7.aggregates.total_commission_rub;
  const driftRub = Math.abs(totalCommOverview - sumIndependent);
  const driftOk = driftRub <= Math.max(1, Math.floor(totalCommOverview * 0.001));
  const fpDrift = makeFingerprint([GOV_ALERT.COMMISSION_SUM_DRIFT, ENTITY_PLATFORM, ENTITY_PLATFORM, "critical"]);
  if (!driftOk) {
    await upsertOpenAlert(db, {
      fingerprint: fpDrift,
      alertType: GOV_ALERT.COMMISSION_SUM_DRIFT,
      severity: "critical",
      entityType: ENTITY_PLATFORM,
      entityId: ENTITY_PLATFORM,
      title: "Расхождение суммы commission (overview vs raw)",
      detail: `overview=${totalCommOverview} independent=${sumIndependent} drift_rub=${driftRub}`,
      payloadJson: { totalCommOverview, sumIndependent, driftRub },
    });
    upserts += 1;
  } else {
    const r = await db.governanceAlert.updateMany({
      where: { fingerprint: fpDrift, status: "open" },
      data: { status: "resolved" },
    });
    resolved += r.count;
  }

  const dayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const grantBlocked = await db.auditLog.count({
    where: {
      entityType: "program_ugc",
      changedField: "reward_grant",
      newValue: "blocked",
      createdAt: { gte: dayAgo },
    },
  });
  const fpGrant = makeFingerprint([GOV_ALERT.REWARD_GRANT_BLOCKED_BURST, ENTITY_PLATFORM, ENTITY_PLATFORM, "critical"]);
  if (grantBlocked >= GRANT_BLOCKED_24H_CRITICAL) {
    await upsertOpenAlert(db, {
      fingerprint: fpGrant,
      alertType: GOV_ALERT.REWARD_GRANT_BLOCKED_BURST,
      severity: "critical",
      entityType: ENTITY_PLATFORM,
      entityId: ENTITY_PLATFORM,
      title: "Много блокировок grant reward (24h)",
      detail: `blocked_attempts_24h=${grantBlocked} (порог ${GRANT_BLOCKED_24H_CRITICAL})`,
      payloadJson: { grantBlocked },
    });
    upserts += 1;
  } else {
    resolved += (
      await db.governanceAlert.updateMany({
        where: { fingerprint: fpGrant, status: "open" },
        data: { status: "resolved" },
      })
    ).count;
  }

  const failedRuns = await db.sourceRun.count({
    where: { status: "failed", startedAt: { gte: dayAgo } },
  });
  const fpRuns = makeFingerprint([GOV_ALERT.SOURCE_RUNS_FAILED_BURST, ENTITY_PLATFORM, ENTITY_PLATFORM, "critical"]);
  if (failedRuns >= FAILED_RUNS_24H_CRITICAL) {
    await upsertOpenAlert(db, {
      fingerprint: fpRuns,
      alertType: GOV_ALERT.SOURCE_RUNS_FAILED_BURST,
      severity: "critical",
      entityType: ENTITY_PLATFORM,
      entityId: ENTITY_PLATFORM,
      title: "Много неуспешных ingestion runs (24h)",
      detail: `failed_runs_24h=${failedRuns} (порог ${FAILED_RUNS_24H_CRITICAL})`,
      payloadJson: { failedRuns },
    });
    upserts += 1;
  } else {
    resolved += (
      await db.governanceAlert.updateMany({
        where: { fingerprint: fpRuns, status: "open" },
        data: { status: "resolved" },
      })
    ).count;
  }

  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const stuckSources = await db.source.count({
    where: {
      isActive: true,
      lifecycleState: "active",
      lastErrorAt: { not: null },
      OR: [{ lastSuccessAt: null }, { lastSuccessAt: { lt: sevenDaysAgo } }],
    },
  });
  const fpStuck = makeFingerprint([GOV_ALERT.INGESTION_SOURCES_STUCK, ENTITY_PLATFORM, ENTITY_PLATFORM, "warning"]);
  if (stuckSources >= INGESTION_STUCK_SOURCES_WARN) {
    await upsertOpenAlert(db, {
      fingerprint: fpStuck,
      alertType: GOV_ALERT.INGESTION_SOURCES_STUCK,
      severity: "warning",
      entityType: ENTITY_PLATFORM,
      entityId: ENTITY_PLATFORM,
      title: "Источники с ошибками без успешного сбора (7d)",
      detail: `active_sources_stuck=${stuckSources} (порог ${INGESTION_STUCK_SOURCES_WARN}): isActive, lastError set, lastSuccess старше 7d или null`,
      payloadJson: { stuckSources, threshold: INGESTION_STUCK_SOURCES_WARN },
    });
    upserts += 1;
  } else {
    resolved += (
      await db.governanceAlert.updateMany({
        where: { fingerprint: fpStuck, status: "open" },
        data: { status: "resolved" },
      })
    ).count;
  }

  const conversionNotifyFailed = await db.conversionMessageDraft.count({
    where: { ownerNotifiedAt: null, ownerNotifyLastError: { not: null } },
  });
  const convSeverity = conversionNotifyFailed >= CONVERSION_NOTIFY_FAILED_CRITICAL ? "critical" : "warning";
  const fpConv = makeFingerprint([GOV_ALERT.CONVERSION_OWNER_NOTIFY_FAILED, ENTITY_PLATFORM, ENTITY_PLATFORM, "v1"]);
  if (conversionNotifyFailed > 0) {
    await upsertOpenAlert(db, {
      fingerprint: fpConv,
      alertType: GOV_ALERT.CONVERSION_OWNER_NOTIFY_FAILED,
      severity: convSeverity,
      entityType: ENTITY_PLATFORM,
      entityId: ENTITY_PLATFORM,
      title: "Conversion drafts: ошибки доставки owner (Telegram)",
      detail: `drafts_with_notify_error=${conversionNotifyFailed} (critical при ≥${CONVERSION_NOTIFY_FAILED_CRITICAL})`,
      payloadJson: { conversionNotifyFailed, thresholdCritical: CONVERSION_NOTIFY_FAILED_CRITICAL },
    });
    upserts += 1;
  } else {
    resolved += (
      await db.governanceAlert.updateMany({
        where: { fingerprint: fpConv, status: "open" },
        data: { status: "resolved" },
      })
    ).count;
  }

  const granted = Math.max(1, overview7.funnel.rewards_granted);
  const expired = overview7.aggregates.total_rewards_expired;
  const expiryPct = (expired / granted) * 100;
  const expiryThreshold = env.ECON_EXPIRY_HEALTH_RATIO ?? 50;
  const fpExp = makeFingerprint([GOV_ALERT.EXPIRY_RATIO_HIGH, ENTITY_PLATFORM, ENTITY_PLATFORM, "warning"]);
  if (expiryPct > expiryThreshold) {
    await upsertOpenAlert(db, {
      fingerprint: fpExp,
      alertType: GOV_ALERT.EXPIRY_RATIO_HIGH,
      severity: "warning",
      entityType: ENTITY_PLATFORM,
      entityId: ENTITY_PLATFORM,
      title: "Высокий expired / granted (7d)",
      detail: `expired=${expired} granted=${granted} ratio_pct=${expiryPct.toFixed(1)} (порог env ${expiryThreshold}%)`,
      payloadJson: { expired, granted, expiryPct, expiryThreshold },
    });
    upserts += 1;
  } else {
    resolved += (
      await db.governanceAlert.updateMany({
        where: { fingerprint: fpExp, status: "open" },
        data: { status: "resolved" },
      })
    ).count;
  }

  const overrideCount = dash.programs_overridden.length + dash.referrals_overridden.length;
  const fpOv = makeFingerprint([GOV_ALERT.MANY_ACTIVE_OVERRIDES, ENTITY_PLATFORM, ENTITY_PLATFORM, "warning"]);
  if (overrideCount > MAX_OVERRIDES_WARN) {
    await upsertOpenAlert(db, {
      fingerprint: fpOv,
      alertType: GOV_ALERT.MANY_ACTIVE_OVERRIDES,
      severity: "warning",
      entityType: ENTITY_PLATFORM,
      entityId: ENTITY_PLATFORM,
      title: "Много активных ручных override",
      detail: `programs=${dash.programs_overridden.length} referrals=${dash.referrals_overridden.length} (порог ${MAX_OVERRIDES_WARN})`,
      payloadJson: { programs: dash.programs_overridden.length, referrals: dash.referrals_overridden.length },
    });
    upserts += 1;
  } else {
    resolved += (
      await db.governanceAlert.updateMany({
        where: { fingerprint: fpOv, status: "open" },
        data: { status: "resolved" },
      })
    ).count;
  }

  const weekAgo = new Date(now.getTime() - MULTIPLIER_CHURN_DAYS * 24 * 60 * 60 * 1000);
  const churnGroups = await db.auditLog.groupBy({
    by: ["entityId"],
    where: {
      entityType: "program",
      changedField: "economicsRewardMultiplierBps",
      createdAt: { gte: weekAgo },
    },
    _count: { _all: true },
  });
  for (const row of churnGroups) {
    if ((row._count._all ?? 0) < MULTIPLIER_CHURN_MIN_EVENTS) continue;
    const fpCh = makeFingerprint([
      GOV_ALERT.PROGRAM_MULTIPLIER_CHURN,
      "program",
      row.entityId,
      "warning",
    ]);
    await upsertOpenAlert(db, {
      fingerprint: fpCh,
      alertType: GOV_ALERT.PROGRAM_MULTIPLIER_CHURN,
      severity: "warning",
      entityType: "program",
      entityId: row.entityId,
      title: "Частые изменения множителя программы (guardrails)",
      detail: `изменений economicsRewardMultiplierBps за ${MULTIPLIER_CHURN_DAYS}d: ${row._count._all}`,
      payloadJson: { programId: row.entityId, events: row._count._all },
    });
    upserts += 1;
  }

  const discCur = overview7.aggregates.total_discount_rub;
  const discPrev = overviewPrev.aggregates.total_discount_rub;
  const dtc = overview7.funnel.derived.discount_to_completed_pct;
  const wow =
    discPrev > 0 ? (discCur - discPrev) / discPrev : discCur > 0 ? 1 : 0;
  const fpDisc = makeFingerprint([GOV_ALERT.DISCOUNT_SURGE_LOW_COMPLETION, ENTITY_PLATFORM, ENTITY_PLATFORM, "warning"]);
  if (wow >= DISCOUNT_WOW_RATIO_WARN && dtc < COMPLETION_WEAK_PCT && discCur > 0) {
    await upsertOpenAlert(db, {
      fingerprint: fpDisc,
      alertType: GOV_ALERT.DISCOUNT_SURGE_LOW_COMPLETION,
      severity: "warning",
      entityType: ENTITY_PLATFORM,
      entityId: ENTITY_PLATFORM,
      title: "Рост скидки при слабом completion",
      detail: `wow_discount=${(wow * 100).toFixed(0)}% discount_to_completed_pct=${dtc} (порог completion ${COMPLETION_WEAK_PCT}%)`,
      payloadJson: { discCur, discPrev, wow, dtc },
    });
    upserts += 1;
  } else {
    resolved += (
      await db.governanceAlert.updateMany({
        where: { fingerprint: fpDisc, status: "open" },
        data: { status: "resolved" },
      })
    ).count;
  }

  const recoveredTotal = await db.userReward.count({
    where: { recoveredAt: { gte: from7, lte: to } },
  });
  const recoveredOrg = await db.userReward.count({
    where: {
      recoveredAt: { gte: from7, lte: to },
      recoveredCancellationKind: "organizer_cancelled",
    },
  });
  const orgRatio = recoveredTotal > 0 ? recoveredOrg / recoveredTotal : 0;
  const fpRec = makeFingerprint([
    GOV_ALERT.RECOVERY_ORGANIZER_CANCELLED_HIGH,
    ENTITY_PLATFORM,
    ENTITY_PLATFORM,
    "warning",
  ]);
  if (recoveredTotal >= 5 && orgRatio >= RECOVERY_ORG_RATIO_WARN) {
    await upsertOpenAlert(db, {
      fingerprint: fpRec,
      alertType: GOV_ALERT.RECOVERY_ORGANIZER_CANCELLED_HIGH,
      severity: "warning",
      entityType: ENTITY_PLATFORM,
      entityId: ENTITY_PLATFORM,
      title: "Доля recovery при organizer_cancelled высокая",
      detail: `recovered=${recoveredTotal} organizer_cancelled=${recoveredOrg} ratio=${(orgRatio * 100).toFixed(0)}%`,
      payloadJson: { recoveredTotal, recoveredOrg, orgRatio },
    });
    upserts += 1;
  } else {
    resolved += (
      await db.governanceAlert.updateMany({
        where: { fingerprint: fpRec, status: "open" },
        data: { status: "resolved" },
      })
    ).count;
  }

  const criticalDelivered = await deliverCriticalAlerts(db, env);

  return {
    evaluated_at: now.toISOString(),
    upserts,
    resolved,
    critical_delivered: criticalDelivered,
  };
}

async function deliverCriticalAlerts(db: PrismaClient, env: Env): Promise<number> {
  const cooldown = Math.max(60_000, env.ECON_GOVERNANCE_CRITICAL_COOLDOWN_MS ?? 21_600_000);
  const now = Date.now();
  const open = await db.governanceAlert.findMany({
    where: { severity: "critical", status: "open" },
    orderBy: { lastSeenAt: "desc" },
  });

  let sent = 0;
  const chatId = env.TELEGRAM_ALERT_CHAT_ID?.trim();
  const emailTo = env.ECON_GOVERNANCE_ALERT_EMAIL?.trim();

  for (const a of open) {
    const last = a.lastSentAt?.getTime() ?? 0;
    if (now - last < cooldown && last > 0) continue;

    const text = `[CRITICAL] ${a.title}\n${a.detail ?? ""}\n type=${a.alertType} entity=${a.entityType}:${a.entityId}`;
    if (chatId) {
      const tr = await sendNotificationTelegram(env, chatId, text.slice(0, 3900));
      if (!tr.ok) {
        console.warn("[governance-alert] telegram failed", tr.reason);
      }
    }
    if (emailTo && env.EMAIL_PROVIDER_KEY) {
      const er = await sendNotificationEmail(
        env,
        emailTo,
        `[MyWave] CRITICAL: ${a.title}`,
        `<pre>${escapeHtml(text)}</pre>`,
      );
      if (!er.ok) {
        console.warn("[governance-alert] email failed", er.reason);
      }
    }
    await db.governanceAlert.update({
      where: { id: a.id },
      data: { lastSentAt: new Date() },
    });
    sent += 1;
  }
  return sent;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/** Daily digest: warning (и опционально info) в email; обновляет lastDigestAt. */
export async function runGovernanceDigest(db: PrismaClient, env: Env): Promise<{ sent: boolean; count: number }> {
  if (!env.ECON_GOVERNANCE_ALERTS_ENABLED) {
    return { sent: false, count: 0 };
  }
  const emailTo = env.ECON_GOVERNANCE_ALERT_EMAIL?.trim();
  if (!emailTo || !env.EMAIL_PROVIDER_KEY) {
    return { sent: false, count: 0 };
  }

  const warnings = await db.governanceAlert.findMany({
    where: { severity: "warning", status: "open" },
    orderBy: { lastSeenAt: "desc" },
    take: 50,
  });
  if (warnings.length === 0) {
    return { sent: false, count: 0 };
  }

  const lines = warnings
    .map((w) => `<li><strong>${escapeHtml(w.title)}</strong> — ${escapeHtml(w.detail ?? "")} <code>${escapeHtml(w.alertType)}</code></li>`)
    .join("");
  const html = `<h2>Governance alerts (warning)</h2><ul>${lines}</ul><p>Админка: /alerts или /admin/economics.</p>`;
  const r = await sendNotificationEmail(env, emailTo, "[MyWave] Daily: economics governance warnings", html);
  const sent = r.ok;
  const now = new Date();
  if (sent) {
    await db.governanceAlert.updateMany({
      where: { id: { in: warnings.map((w) => w.id) } },
      data: { lastDigestAt: now },
    });
    await db.governanceDigestState.upsert({
      where: { id: "default" },
      create: { id: "default", lastDigestSentAt: now },
      update: { lastDigestSentAt: now },
    });
  }
  return { sent, count: warnings.length };
}

export async function getGovernanceAlertsDashboard(db: PrismaClient) {
  const [openAll, criticalOpen, digestRow] = await Promise.all([
    db.governanceAlert.findMany({
      where: { status: "open" },
      orderBy: [{ severity: "asc" }, { lastSeenAt: "desc" }],
      take: 100,
      select: {
        id: true,
        fingerprint: true,
        alertType: true,
        severity: true,
        entityType: true,
        entityId: true,
        title: true,
        detail: true,
        firstSeenAt: true,
        lastSeenAt: true,
        lastSentAt: true,
        lastDigestAt: true,
      },
    }),
    db.governanceAlert.count({ where: { status: "open", severity: "critical" } }),
    db.governanceDigestState.findUnique({ where: { id: "default" } }),
  ]);

  return {
    active_alerts: openAll,
    critical_open_count: criticalOpen,
    last_digest_sent_at: digestRow?.lastDigestSentAt?.toISOString() ?? null,
  };
}
