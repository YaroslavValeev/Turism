import type { Env } from "@mywave/config";
import { prisma } from "../../lib/prisma";
import { runConversionFunnelTick } from "./runTick";

export function startConversionFunnelScheduler(env: Env) {
  if (!env.CONVERSION_FUNNEL_ENABLED || !env.CONVERSION_FUNNEL_SCHEDULER_ENABLED) return;

  const intervalMs = Math.max(60_000, env.CONVERSION_FUNNEL_INTERVAL_MS);
  let running = false;

  const tick = async () => {
    if (running) return;
    running = true;
    try {
      const r = await runConversionFunnelTick(prisma, env);
      if (r.processed > 0) {
        console.log("[conversion-funnel] tick processed", r.processed, "programs");
      }
    } catch (e) {
      console.error("[conversion-funnel] tick failed", e instanceof Error ? e.message : String(e));
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
