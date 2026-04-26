import { getContentEntries, type ContentEntriesResponse } from "./tools.js";
import { ANALYTICS_SYSTEM_PROMPT } from "./prompt.js";
import { callLlm } from "../shared/llm.js";
import {
  buildSignals,
  summarizeSignals,
  type SignalRow,
  type SignalStrength,
} from "./signals.js";

export type AnalyticsSnapshot = {
  data: ContentEntriesResponse;
  signals: SignalRow[];
  totals: {
    totalBookings: number;
    withEntryPair: number;
    strongCount: number;
    weakCount: number;
    noneCount: number;
  };
  llmInsight: string;
};

export async function runAnalyticsSnapshot(): Promise<AnalyticsSnapshot> {
  const data = await getContentEntries();
  const signals = buildSignals(data.rows);
  const summary = summarizeSignals(signals);
  const response = await callLlm({
    systemPrompt: ANALYTICS_SYSTEM_PROMPT,
    userPayload: JSON.stringify(
      {
        ...data,
        signalSummary: {
          strong: summary.strong.length,
          weak: summary.weak.length,
          none: summary.none.length,
        },
      },
      null,
      0
    ),
  });
  return {
    data,
    signals,
    totals: {
      totalBookings: data.totals.bookingsInRange,
      withEntryPair: data.totals.withEntryPair,
      strongCount: summary.strong.length,
      weakCount: summary.weak.length,
      noneCount: summary.none.length,
    },
    llmInsight: response,
  };
}

/**
 * Backward-compatible текстовый отчёт (используется legacy runner-ом analytics).
 */
export async function runAnalyticsAgent(): Promise<string> {
  const snapshot = await runAnalyticsSnapshot();
  const pick = (strength: SignalStrength) =>
    snapshot.signals
      .filter((s) => s.signal === strength)
      .slice(0, 5)
      .map((s) => `${s.entryType}/${s.entryId} (${s.bookingCount})`);

  const lines = [
    `📊 Analytics Snapshot`,
    `Заявок в диапазоне: ${snapshot.totals.totalBookings}`,
    `С entry-парой: ${snapshot.totals.withEntryPair}`,
    `Сигналы: STRONG=${snapshot.totals.strongCount}, WEAK=${snapshot.totals.weakCount}, NONE=${snapshot.totals.noneCount}`,
    "",
    "TOP STRONG:",
    ...(pick("STRONG").length ? pick("STRONG") : ["— нет"]),
    "",
    "TOP WEAK:",
    ...(pick("WEAK").length ? pick("WEAK") : ["— нет"]),
    "",
    "LLM insight:",
    snapshot.llmInsight || "—",
  ];
  return lines.join("\n");
}
