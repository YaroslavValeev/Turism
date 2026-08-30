import type { Env } from "@mywave/config";
import { claimDailyRun, completeDailyRun, failDailyRun } from "./dailyRunLock";
import { runDailySyncJob } from "./service";
import { sendPendingSourceProposalDigest } from "../sources/sourceProposalDigest";

function dayKey(now: Date): string {
  return `${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()}`;
}

export function startIngestionScheduler(env: Env) {
  if (!env.INGESTION_DAILY_ENABLED) return;

  let running = false;

  const tick = async () => {
    const now = new Date();
    if (running) return;
    if (now.getHours() < env.INGESTION_DAILY_HOUR_LOCAL) return;
    const key = dayKey(now);
    running = true;
    let claim: Awaited<ReturnType<typeof claimDailyRun>> = null;
    try {
      claim = await claimDailyRun(key, now);
      if (!claim) return;

      const summary = await runDailySyncJob("system", {
        autoPublishEnabled: env.INGESTION_AUTOPUBLISH_ENABLED,
        fallbackImageUrl: env.INGESTION_DEFAULT_FALLBACK_IMAGE_URL,
        sourceLimit: env.INGESTION_DAILY_SOURCE_LIMIT,
      });
      // Notification is useful operationally but must never turn a completed
      // ingestion run into a failed one or trigger a duplicate retry.
      const sourceProposalDigest = await sendPendingSourceProposalDigest(env).catch((error) => {
        console.error(
          "[ingestion-scheduler] source proposal digest failed",
          error instanceof Error ? error.message : String(error),
        );
        return { status: "failed" as const };
      });
      await completeDailyRun(claim);
      console.log("[ingestion-scheduler] daily sync complete", { ...summary, sourceProposalDigest });
    } catch (error) {
      // A claim can fail before ownership is established; only an owned lease
      // is eligible for a durable failure transition.
      if (claim) await failDailyRun(claim, error);
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
