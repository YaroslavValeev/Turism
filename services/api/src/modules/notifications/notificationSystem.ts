import type { Env } from "@mywave/config";
import { prisma } from "../../lib/prisma";
import { processNotificationsBatch } from "./processJobs";
import { enqueueUpcomingProgramsForLeadDay } from "./scanUpcoming";

function dayKeyLocal(now: Date): string {
  return `${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()}`;
}

/** Планировщик «за N дней» + опциональный poller очереди в процессе API. */
export function startNotificationSystem(env: Env): void {
  if (!env.NOTIFICATIONS_ENABLED) {
    return;
  }

  let lastSchedulerDay: string | null = null;

  const runScheduler = async () => {
    if (!env.NOTIFICATIONS_SCHEDULER_ENABLED) return;
    const now = new Date();
    if (now.getHours() < env.NOTIFICATIONS_DAILY_HOUR_LOCAL) return;
    const key = dayKeyLocal(now);
    if (lastSchedulerDay === key) return;
    try {
      const programsTouched = await enqueueUpcomingProgramsForLeadDay(prisma, env, now);
      lastSchedulerDay = key;
      console.log("[notifications-scheduler] enqueued upcoming jobs", { localDay: key, programs: programsTouched });
    } catch (error) {
      console.error("[notifications-scheduler]", error instanceof Error ? error.message : String(error));
    }
  };

  const schedTimer = setInterval(() => {
    void runScheduler();
  }, 10 * 60 * 1000);
  void runScheduler();

  if (env.NOTIFICATIONS_POLL_MS > 0) {
    const poll = async () => {
      try {
        await processNotificationsBatch(env, prisma, 25);
      } catch (error) {
        console.error("[notifications-poll]", error instanceof Error ? error.message : String(error));
      }
    };
    const pollTimer = setInterval(() => {
      void poll();
    }, env.NOTIFICATIONS_POLL_MS);
    void poll();
    if (typeof (pollTimer as { unref?: () => void }).unref === "function") {
      (pollTimer as { unref: () => void }).unref();
    }
  }

  if (typeof (schedTimer as { unref?: () => void }).unref === "function") {
    (schedTimer as { unref: () => void }).unref();
  }
}
