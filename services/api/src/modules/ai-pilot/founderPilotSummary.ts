import type { Env } from "@mywave/config";
import { prisma } from "../../lib/prisma";
import { getPilotKpiSnapshot } from "../../lib/pilotKpiSnapshot";
import { buildFounderSummary } from "../metrics/founderSummary";
import { callOpenAiJson } from "./openaiJson";

export type FounderPilotPeriod = "daily" | "weekly";

export type FounderPilotResult = {
  period: FounderPilotPeriod;
  summary: string;
  keyMetrics: Record<string, unknown>;
  risks: string[];
  recommendedActions: string[];
  requiresOwnerDecision: string[];
  source: "llm" | "fallback";
  fallbackReason?: string;
};

const SYSTEM = `Ты готовишь краткую управленческую сводку владельцу пилота MyWave.
Используй только цифры и факты из переданного JSON. Не придумывай брони/деньги.
Верни JSON: {
  "summary": "2-4 предложения на русском",
  "risks": ["строка", ...],
  "recommendedActions": ["строка", ...],
  "requiresOwnerDecision": ["строка", ...]
}
Без PII, без email/телефонов.`;

function windowStart(period: FounderPilotPeriod): Date {
  const d = new Date();
  if (period === "daily") d.setUTCHours(d.getUTCHours() - 24);
  else d.setUTCDate(d.getUTCDate() - 7);
  return d;
}

export async function buildFounderPilotSummary(
  env: Env,
  period: FounderPilotPeriod
): Promise<FounderPilotResult> {
  const pilot = await getPilotKpiSnapshot(env.PILOT_MODE_ENABLED);
  const from = windowStart(period);
  const newBookings = await prisma.booking.count({ where: { createdAt: { gte: from } } });
  const founder = await buildFounderSummary();

  const keyMetrics: Record<string, unknown> = {
    pilot: pilot.shadow,
    newBookingsInPeriod: newBookings,
    dqHealth: founder.dq_health_status,
    organizerScoreAvg: founder.organizer_score_summary.average,
    programScoreAvg: founder.program_score_summary.average,
    weakProgramIds: founder.top_weak_programs.map((p) => p.programId),
    weakOrganizerIds: founder.top_weak_organizers.map((o) => o.organizerId),
  };

  const pack = { period, pilot, newBookingsInPeriod: newBookings, founderSummary: founder };
  const r = await callOpenAiJson(
    env,
    [
      { role: "system", content: SYSTEM },
      { role: "user", content: JSON.stringify(pack) },
    ],
    { timeoutMs: 60_000 }
  );

  if (r.ok && r.json && typeof r.json === "object") {
    const o = r.json as Record<string, unknown>;
    return {
      period,
      summary: typeof o.summary === "string" ? o.summary : "Сводка сформирована.",
      keyMetrics,
      risks: Array.isArray(o.risks) ? o.risks.map(String) : [],
      recommendedActions: Array.isArray(o.recommendedActions) ? o.recommendedActions.map(String) : [],
      requiresOwnerDecision: Array.isArray(o.requiresOwnerDecision) ? o.requiresOwnerDecision.map(String) : [],
      source: "llm",
    };
  }

  const rsn = r.ok ? "invalid_llm_shape" : r.reason;
  return {
    period,
    summary:
      `Пилот: брони всего ${pilot.shadow.bookingsTotal}, за период (${period}) новых заявок: ${newBookings}. ` +
      `Shadow GMV (агрегат): ${pilot.shadow.sumGmvRub}. DQ: ${founder.dq_health_status}. ` +
      `AI-текст недоступен (${rsn}) — смотрите keyMetrics и админ-дашборды.`,
    keyMetrics,
    risks: [],
    recommendedActions: [
      "Проверьте слабые programId/organizerId в keyMetrics (скоринг).",
      "Настройте OPENAI + AI_ENABLED=1 для текстовой сводки.",
    ],
    requiresOwnerDecision: [],
    source: "fallback",
    fallbackReason: rsn,
  };
}
