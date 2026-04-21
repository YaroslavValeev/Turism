import type { Env } from "@mywave/config";
import type { PrismaClient } from "@prisma/client";
import { runGovernanceAlertCycle, runGovernanceDigest } from "./runCycle";

/**
 * Периодический evaluate + раз в сутки digest в локальном часу сервера (см. ECON_GOVERNANCE_DIGEST_HOUR_LOCAL).
 * В production часто лучше внешний cron → POST /admin/economics/alerts/evaluate и /alerts/digest.
 */
export function startGovernanceAlertScheduler(env: Env, db: PrismaClient): void {
  if (!env.ECON_GOVERNANCE_ALERTS_ENABLED || !env.ECON_GOVERNANCE_SCHEDULER_ENABLED) {
    return;
  }

  const evalMs = Math.max(300_000, env.ECON_GOVERNANCE_EVAL_INTERVAL_MS ?? 21_600_000);
  const digestHour = Math.min(23, Math.max(0, Math.floor(env.ECON_GOVERNANCE_DIGEST_HOUR_LOCAL ?? 9)));
  let lastDigestUtcDay: string | null = null;
  let running = false;

  const tick = async () => {
    if (running) return;
    running = true;
    try {
      await runGovernanceAlertCycle(db, env);

      const now = new Date();
      if (now.getHours() === digestHour) {
        const dayKey = now.toISOString().slice(0, 10);
        if (lastDigestUtcDay !== dayKey) {
          await runGovernanceDigest(db, env);
          lastDigestUtcDay = dayKey;
        }
      }
    } catch (e) {
      console.error("[governance-scheduler]", e instanceof Error ? e.message : String(e));
    } finally {
      running = false;
    }
  };

  const timer = setInterval(() => {
    void tick();
  }, evalMs);

  if (typeof (timer as { unref?: () => void }).unref === "function") {
    (timer as { unref: () => void }).unref();
  }

  void tick();
}
