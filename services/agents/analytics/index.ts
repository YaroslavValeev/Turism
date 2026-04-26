import cron from "node-cron";
import { run } from "./runner.js";

const schedule = process.env.ANALYTICS_AGENT_CRON ?? "0 10 * * *";
const tz = process.env.ANALYTICS_AGENT_TZ; // напр. Europe/Moscow

console.log("Analytics agent cron:", schedule, tz ? `(${tz})` : "");

const opts = tz ? { timezone: tz } : undefined;
cron.schedule(
  schedule,
  async () => {
    console.log("Running analytics agent…", new Date().toISOString());
    try {
      await run();
    } catch (e) {
      console.error("Analytics agent run failed", e);
    }
  },
  opts
);
