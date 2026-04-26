import { loadRepoEnv } from "../shared/loadEnv.js";
import { runMarketingAgent } from "./agent.js";
import { splitTelegramMessage } from "../analytics/formatter.js";
import { sendToTelegram } from "../shared/telegram.js";
import { loadMemory } from "../memory/store.js";
import { getContentEntries } from "./tools.js";
import { buildSignals, summarizeSignals } from "../analytics/signals.js";

loadRepoEnv();

export async function run(): Promise<void> {
  const data = await getContentEntries();
  const signals = buildSignals(data.rows);
  const summary = summarizeSignals(signals);
  const memory = await loadMemory();
  const plan = await runMarketingAgent({
    strongSignals: summary.strong,
    weakSignals: summary.weak,
    totals: {
      totalBookings: data.totals.bookingsInRange,
      withEntryPair: data.totals.withEntryPair,
      noEntryTracking: data.totals.noEntryTracking,
    },
    memory,
  });
  const result = JSON.stringify(plan, null, 2);
  const chunks = splitTelegramMessage(result);
  for (let i = 0; i < chunks.length; i += 1) {
    const prefix = chunks.length > 1 ? `(${i + 1}/${chunks.length})\n` : "";
    await sendToTelegram(prefix + chunks[i]);
  }
  console.log("Marketing agent: отправлено в Telegram, частей:", chunks.length);
}
