import { loadRepoEnv } from "../shared/loadEnv.js";
import { runAnalyticsAgent } from "./agent.js";
import { splitTelegramMessage } from "./formatter.js";
import { sendToTelegram } from "../shared/telegram.js";

loadRepoEnv();

export async function run(): Promise<void> {
  const result = await runAnalyticsAgent();
  const chunks = splitTelegramMessage(result);
  for (let i = 0; i < chunks.length; i += 1) {
    const prefix = chunks.length > 1 ? `(${i + 1}/${chunks.length})\n` : "";
    await sendToTelegram(prefix + chunks[i]);
  }
  console.log("Analytics agent: отправлено в Telegram, частей:", chunks.length);
}
