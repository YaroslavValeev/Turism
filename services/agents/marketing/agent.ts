import { callLlm } from "../shared/llm.js";
import { MARKETING_SYSTEM_PROMPT } from "./prompt.js";
import { parseMarketingPlan, type MarketingPlan } from "./validator.js";

export type RunMarketingInput = {
  strongSignals: Array<{ entryType: string; entryId: string; bookingCount: number }>;
  weakSignals: Array<{ entryType: string; entryId: string; bookingCount: number }>;
  totals: { totalBookings: number; withEntryPair: number; noEntryTracking: number };
  memory: {
    tested_topics: string[];
    failed_topics: string[];
    successful_topics: string[];
    last_used_topics: string[];
  };
};

export async function runMarketingAgent(input: RunMarketingInput): Promise<MarketingPlan> {
  if (input.strongSignals.length === 0) {
    return {
      top: [],
      actions: [],
      notes: "Недостаточно сильных сигналов.",
      confidence: 0,
    };
  }

  const model = process.env.OPENAI_MARKETING_MODEL?.trim() || process.env.OPENAI_ANALYTICS_MODEL?.trim();
  const raw = await callLlm({
    systemPrompt: MARKETING_SYSTEM_PROMPT,
    userPayload: JSON.stringify(input, null, 2),
    model: model || undefined,
  });

  const parsed = parseMarketingPlan(raw);
  if (!parsed) {
    return {
      top: input.strongSignals.slice(0, 3).map((s) => `${s.entryType}/${s.entryId}`),
      actions: [],
      notes: "Модель вернула невалидный JSON. Проверьте промпт/модель и повторите запуск.",
      confidence: 0,
    };
  }
  return parsed;
}
