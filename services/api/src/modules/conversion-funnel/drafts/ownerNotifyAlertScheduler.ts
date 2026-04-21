import type { Env } from "@mywave/config";
import { prisma } from "../../../lib/prisma";
import { sendOpsTelegramAlertBestEffort } from "../../../lib/opsTelegramAlert";

const ALERT_KEY = "conversion.owner_notify_failed";

async function shouldFireWithCooldown(env: Env, fingerprint: string): Promise<boolean> {
  const cooldownMs = Math.max(60, env.ANALYTICS_ALERT_COOLDOWN_SECONDS) * 1000;
  const now = new Date();
  const existing = await prisma.analyticsAlertState.findUnique({ where: { alertKey: ALERT_KEY } });
  if (!existing) {
    await prisma.analyticsAlertState.create({
      data: { alertKey: ALERT_KEY, lastFiredAt: now, lastFingerprint: fingerprint },
    });
    return true;
  }
  const elapsed = now.getTime() - existing.lastFiredAt.getTime();
  const sameFingerprint = existing.lastFingerprint === fingerprint;
  if (sameFingerprint && elapsed < cooldownMs) {
    return false;
  }
  await prisma.analyticsAlertState.update({
    where: { alertKey: ALERT_KEY },
    data: { lastFiredAt: now, lastFingerprint: fingerprint },
  });
  return true;
}

/**
 * Счётчик как в GET /admin/conversion-drafts/stats/summary (ownerNotifyFailed).
 * Отдельный алерт от analytics: только conversion drafts + TELEGRAM_ALERT_CHAT_ID.
 */
export async function runConversionOwnerNotifyAlertOnce(env: Env): Promise<{ count: number; fired: boolean }> {
  const count = await prisma.conversionMessageDraft.count({
    where: {
      ownerNotifiedAt: null,
      ownerNotifyLastError: { not: null },
    },
  });
  if (count === 0) {
    return { count: 0, fired: false };
  }
  const fingerprint = `count:${count}`;
  const ok = await shouldFireWithCooldown(env, fingerprint);
  if (!ok) {
    return { count, fired: false };
  }
  sendOpsTelegramAlertBestEffort(
    `MyWave conversion: owner Telegram notify failures (drafts): ${count}. Проверьте /admin/conversion-drafts (ownerNotifyFailed).`,
  );
  return { count, fired: true };
}

export function startConversionOwnerNotifyAlertScheduler(env: Env): void {
  if (!env.CONVERSION_OWNER_NOTIFY_ALERT_ENABLED) {
    return;
  }
  const intervalMs = Math.max(60_000, env.CONVERSION_OWNER_NOTIFY_ALERT_INTERVAL_MS);
  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      await runConversionOwnerNotifyAlertOnce(env);
    } catch (e) {
      console.error(
        "[conversion-owner-notify-alert]",
        e instanceof Error ? e.message : String(e),
      );
    } finally {
      running = false;
    }
  };
  const timer = setInterval(() => {
    void tick();
  }, intervalMs);
  if (typeof (timer as { unref?: () => void }).unref === "function") {
    (timer as { unref: () => void }).unref();
  }
  void tick();
}
