import { Prisma } from "@prisma/client";
import type { Env } from "@mywave/config";
import { prisma } from "../../lib/prisma";
import { getApiEnv } from "./runtimeEnv";
import { computeDqMetrics } from "./dqMetrics";
import { callTelegramJson, isTelegramBotApiConfigured } from "../telegram/telegramApi";

type AlertFire = { key: string; message: string; fingerprint: string };

async function sendTelegramMessage(env: Env, text: string): Promise<boolean> {
  const chatId = env.TELEGRAM_ALERT_CHAT_ID?.trim();
  if (!chatId || !isTelegramBotApiConfigured(env)) return false;
  const resp = await callTelegramJson(env, "sendMessage", {
    chat_id: chatId,
    text,
    disable_web_page_preview: true,
  });
  return resp.ok;
}

async function shouldFire(env: Env, key: string, fingerprint: string): Promise<boolean> {
  const cooldownMs = Math.max(60, env.ANALYTICS_ALERT_COOLDOWN_SECONDS) * 1000;
  const now = new Date();

  const existing = await prisma.analyticsAlertState.findUnique({ where: { alertKey: key } });
  if (!existing) {
    await prisma.analyticsAlertState.create({
      data: { alertKey: key, lastFiredAt: now, lastFingerprint: fingerprint },
    });
    return true;
  }

  const elapsed = now.getTime() - existing.lastFiredAt.getTime();
  const sameFingerprint = existing.lastFingerprint === fingerprint;
  if (sameFingerprint && elapsed < cooldownMs) {
    return false;
  }

  await prisma.analyticsAlertState.update({
    where: { alertKey: key },
    data: { lastFiredAt: now, lastFingerprint: fingerprint },
  });
  return true;
}

export async function runAnalyticsAlerts(): Promise<{ fired: AlertFire[]; skipped: string[]; telegram: boolean }> {
  const env = getApiEnv();
  if (!env.ANALYTICS_ENABLED) {
    return { fired: [], skipped: ["ANALYTICS_ENABLED is off"], telegram: false };
  }

  const fired: AlertFire[] = [];
  const skipped: string[] = [];

  const refundAnomaly = await prisma.$queryRaw<
    { day: Date; organizer_id: string; payments_amount_rub: bigint; refunds_amount_rub: bigint }[]
  >(Prisma.sql`
    SELECT day, "organizerId" as organizer_id, payments_amount_rub, refunds_amount_rub
    FROM mv_billing_daily
    WHERE refunds_amount_rub > payments_amount_rub AND payments_amount_rub > 0
    ORDER BY day DESC
    LIMIT 20
  `);

  for (const row of refundAnomaly) {
    const key = `billing.refunds_gt_payments:${row.organizer_id}`;
    const fingerprint = `${row.day.toISOString().slice(0, 10)}:${row.payments_amount_rub.toString()}:${row.refunds_amount_rub.toString()}`;
    const message = `Billing anomaly: refunds > payments (organizer=${row.organizer_id}, day=${row.day.toISOString().slice(
      0,
      10
    )}, payments=${row.payments_amount_rub}, refunds=${row.refunds_amount_rub})`;
    // eslint-disable-next-line no-await-in-loop
    if (await shouldFire(env, key, fingerprint)) fired.push({ key, message, fingerprint });
    else skipped.push(key);
  }

  const disputed = await prisma.$queryRaw<{ day: Date; organizer_id: string; commissions_disputed_rub: bigint }[]>(Prisma.sql`
    SELECT day, "organizerId" as organizer_id, commissions_disputed_rub
    FROM mv_billing_daily
    WHERE commissions_disputed_rub > 0
    ORDER BY day DESC
    LIMIT 20
  `);

  for (const row of disputed) {
    const key = `billing.disputed_commission:${row.organizer_id}`;
    const fingerprint = `${row.day.toISOString().slice(0, 10)}:${row.commissions_disputed_rub.toString()}`;
    const message = `Billing: disputed commission > 0 (organizer=${row.organizer_id}, day=${row.day.toISOString().slice(
      0,
      10
    )}, amount=${row.commissions_disputed_rub})`;
    // eslint-disable-next-line no-await-in-loop
    if (await shouldFire(env, key, fingerprint)) fired.push({ key, message, fingerprint });
    else skipped.push(key);
  }

  try {
    const dq = await computeDqMetrics(24, env);
    for (const issue of dq.issues) {
      if (!issue.startsWith("critical:")) continue;
      const key = `dq:${issue.slice(0, 80)}`;
      const fingerprint = issue;
      const message = `DQ critical: ${issue}`;
      // eslint-disable-next-line no-await-in-loop
      if (await shouldFire(env, key, fingerprint)) fired.push({ key, message, fingerprint });
      else skipped.push(key);
    }
  } catch {
    skipped.push("dq_metrics_unavailable");
  }

  let telegram = false;
  if (fired.length > 0) {
    const text = ["MyWave analytics alerts", ...fired.map((f) => `- ${f.message}`)].join("\n");
    telegram = await sendTelegramMessage(env, text);
  }

  return { fired, skipped, telegram };
}
