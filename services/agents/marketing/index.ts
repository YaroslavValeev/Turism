import cron from "node-cron";
import { run } from "./runner.js";

const schedule = process.env.MARKETING_AGENT_CRON ?? "0 11 * * *";
const tz = process.env.MARKETING_AGENT_TZ;

console.log("Marketing agent cron:", schedule, tz ? `(${tz})` : "");

const opts = tz ? { timezone: tz } : undefined;
cron.schedule(
  schedule,
  async () => {
    console.log("Running marketing agent…", new Date().toISOString());
    try {
      await run();
    } catch (e) {
      console.error("Marketing agent run failed", e);
    }
  },
  opts
);
