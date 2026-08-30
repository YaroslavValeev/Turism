import type { Env } from "@mywave/config";
import { claimDailyRun, completeDailyRun, failDailyRun } from "../ingestion/dailyRunLock";
import { sendPendingSourceProposalDigest } from "./sourceProposalDigest";

const SOURCE_PROPOSAL_DIGEST_JOB_KEY = "source-proposal-digest";

function dayKey(now: Date): string {
  return `${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()}`;
}

/**
 * A dedicated scheduler for internal source-review notifications. It does not
 * collect sources, normalize items, or invoke the ingestion autopilot.
 */
export function startSourceProposalDigestScheduler(env: Env) {
  if (!env.SOURCE_PROPOSAL_DIGEST_DAILY_ENABLED) return;

  let running = false;
  const tick = async () => {
    const now = new Date();
    if (running || now.getHours() < env.SOURCE_PROPOSAL_DIGEST_DAILY_HOUR_LOCAL) return;

    running = true;
    let claim: Awaited<ReturnType<typeof claimDailyRun>> = null;
    try {
      claim = await claimDailyRun(dayKey(now), now, SOURCE_PROPOSAL_DIGEST_JOB_KEY);
      if (!claim) return;

      const result = await sendPendingSourceProposalDigest(env, now);
      await completeDailyRun(claim, now);
      console.log("[source-proposal-digest] daily run complete", result);
    } catch (error) {
      if (claim) await failDailyRun(claim, error);
      console.error(
        "[source-proposal-digest] daily run failed",
        error instanceof Error ? error.message : String(error),
      );
    } finally {
      running = false;
    }
  };

  const timer = setInterval(() => void tick(), 10 * 60 * 1000);
  if (typeof (timer as { unref?: () => void }).unref === "function") {
    (timer as { unref: () => void }).unref();
  }
  void tick();
}
