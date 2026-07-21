import type { Env } from "@mywave/config";
import { runDailySyncJob } from "./service";

function dayKey(now: Date): string {
  return `${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()}`;
}

export function startIngestionScheduler(env: Env) {
  if (!env.INGESTION_DAILY_ENABLED) return;

  let running = false;
  let lastSuccessfulDay: string | null = null;

  const tick = async () => {
    const now = new Date();
    if (running) return;
    if (now.getHours() < env.INGESTION_DAILY_HOUR_LOCAL) return;
    const key = dayKey(now);
    if (lastSuccessfulDay === key) return;

    running = true;
    try {
      const summary = await runDailySyncJob("system", {
        autoPublishEnabled: env.INGESTION_AUTOPUBLISH_ENABLED,
        fallbackImageUrl: env.INGESTION_DEFAULT_FALLBACK_IMAGE_URL,
        sourceLimit: env.INGESTION_DAILY_SOURCE_LIMIT,
      });
      lastSuccessfulDay = key;
      console.log("[ingestion-scheduler] daily sync complete", summary);
    } catch (error) {
      console.error(
        "[ingestion-scheduler] daily sync failed",
        error instanceof Error ? error.message : String(error),
      );
    } finally {
      running = false;
    }
  };

  const timer = setInterval(() => {
    void tick();
  }, 10 * 60 * 1000);

  if (typeof (timer as { unref?: () => void }).unref === "function") {
    (timer as { unref: () => void }).unref();
  }

  void tick();
}
