import type { Env } from "@mywave/config";
import { runAbandonedLeadReminders, ensureReconciliationTasks, runReconciliationPrompts } from "./schedulers";

/**
 * Периодические задачи Telegram platform (без Redis — setInterval в процессе API).
 */
export function startTelegramPlatformScheduler(env: Env) {
  if (!optionalBoolean("TELEGRAM_PLATFORM_SCHEDULER_ENABLED", false)) return;

  const intervalMs = Math.max(60_000, Number(process.env.TELEGRAM_PLATFORM_SCHEDULER_INTERVAL_MS ?? 900_000));
  let running = false;

  const tick = async () => {
    if (running) return;
    running = true;
    try {
      const abandoned = await runAbandonedLeadReminders(env);
      const ensured = await ensureReconciliationTasks();
      const recon = await runReconciliationPrompts(env);
      if (abandoned.sent > 0 || ensured.created > 0 || recon.sent > 0) {
        console.log("[telegram-platform-scheduler]", { abandoned, ensured, recon });
      }
    } catch (e) {
      console.error("[telegram-platform-scheduler]", e instanceof Error ? e.message : String(e));
    } finally {
      running = false;
    }
  };

  const timer = setInterval(() => void tick(), intervalMs);
  if (typeof (timer as { unref?: () => void }).unref === "function") {
    (timer as { unref: () => void }).unref();
  }
  void tick();
}

function optionalBoolean(key: string, defaultValue: boolean): boolean {
  const value = process.env[key];
  if (value === undefined || value === "") return defaultValue;
  return ["1", "true", "yes", "on"].includes(value.toLowerCase());
}
