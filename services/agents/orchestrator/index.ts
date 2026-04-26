import cron from "node-cron";
import { loadRepoEnv } from "../shared/loadEnv.js";
import { run } from "./runner.js";
import { startTelegramControlLoop } from "./telegramControl.js";

loadRepoEnv();

const schedule = process.env.ORCHESTRATOR_AGENT_CRON ?? "0 12 * * *";
const tz = process.env.ORCHESTRATOR_AGENT_TZ;

console.log("Orchestrator cron:", schedule, tz ? `(${tz})` : "");

const opts = tz ? { timezone: tz } : undefined;
cron.schedule(
  schedule,
  async () => {
    console.log("Running orchestrator daily flow…", new Date().toISOString());
    try {
      await run();
    } catch (e) {
      console.error("Orchestrator run failed", e);
    }
  },
  opts
);

void startTelegramControlLoop().catch((e) => {
  console.error("Telegram control loop crashed", e);
});
