import type { Env } from "@mywave/config";
import { runAnalyticsAlerts } from "./alerts";
import { runMartRefreshWithLog, runScoresRecalculate } from "./opsRunner";

/**
 * Периодический запуск mart refresh, пересчёта score и алертов (в процессе API).
 * Для prod часто предпочтительнее внешний cron — см. docs/analytics/runtime/SCHEDULE.md
 */
export function startAnalyticsOpsScheduler(env: Env) {
  if (!env.ANALYTICS_OPS_SCHEDULER_ENABLED) return;

  const intervalMs = Math.max(60_000, env.ANALYTICS_OPS_INTERVAL_MS);
  let running = false;

  const tick = async () => {
    if (running) return;
    if (!env.ANALYTICS_ENABLED) return;
    running = true;
    try {
      const mart = await runMartRefreshWithLog();
      if (!mart.ok) {
        console.error("[analytics-ops-scheduler] mart refresh failed", mart.error);
      } else {
        console.log("[analytics-ops-scheduler] mart refresh ok", mart.durationMs, "ms");
      }
      const scores = await runScoresRecalculate(env);
      console.log(
        "[analytics-ops-scheduler] scores recalculated",
        scores.organizers.upserted,
        "organizers",
        scores.programs.upserted,
        "programs"
      );
      const alerts = await runAnalyticsAlerts();
      console.log("[analytics-ops-scheduler] alerts", alerts.fired.length, "fired");
    } catch (e) {
      console.error("[analytics-ops-scheduler] tick failed", e instanceof Error ? e.message : String(e));
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
