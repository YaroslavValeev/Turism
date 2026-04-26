import { runDailyFlow } from "../orchestrator.js";

export async function dailyFlow(): Promise<void> {
  await runDailyFlow();
}
