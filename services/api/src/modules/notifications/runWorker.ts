/**
 * Отдельный процесс-воркер: `pnpm --filter api notifications:worker`
 * Требует NOTIFICATIONS_ENABLED=1 и переменные каналов (EMAIL_PROVIDER_KEY / TELEGRAM_BOT_API_BASE_URL).
 */
import "../../env/loadProcessEnv";
import { loadEnv } from "@mywave/config";
import { prisma } from "../../lib/prisma";
import { processNotificationsBatch } from "./processJobs";

const POLL_MS = Number(process.env.NOTIFICATIONS_WORKER_POLL_MS ?? "5000");

async function loop() {
  const env = loadEnv();
  if (!env.NOTIFICATIONS_ENABLED) {
    console.error("[notifications-worker] NOTIFICATIONS_ENABLED is off");
    process.exit(1);
  }
  console.log("[notifications-worker] started", { pollMs: POLL_MS });
  for (;;) {
    try {
      const n = await processNotificationsBatch(env, prisma, 40);
      if (n > 0) {
        console.log("[notifications-worker] processed batch", { claimed: n });
      }
    } catch (e) {
      console.error("[notifications-worker]", e instanceof Error ? e.message : String(e));
    }
    await new Promise((r) => setTimeout(r, POLL_MS));
  }
}

void loop();
