import type { Env } from "@mywave/config";
import { callOpenAiJson } from "./openaiJson";

export type NormalizedProgram = {
  title: string;
  discipline: string;
  region: string;
  location: string;
  dates: string[];
  durationDays: number | null;
  price: number | null;
  level: string;
  riskLevel: string;
  included: string[];
  notIncluded: string[];
  equipmentRequired: string[];
  medicalRestrictions: string[];
  dailyProgram: string[];
  organizer: string;
  cancellationTerms: string;
  missingFields: string[];
  confidence: number;
};

const EMPTY: NormalizedProgram = {
  title: "",
  discipline: "",
  region: "",
  location: "",
  dates: [],
  durationDays: null,
  price: null,
  level: "",
  riskLevel: "",
  included: [],
  notIncluded: [],
  equipmentRequired: [],
  medicalRestrictions: [],
  dailyProgram: [],
  organizer: "",
  cancellationTerms: "",
  missingFields: [],
  confidence: 0,
};

function coerceNormalized(raw: unknown): NormalizedProgram {
  if (!raw || typeof raw !== "object") return { ...EMPTY, missingFields: ["_parse"], confidence: 0 };
  const o = raw as Record<string, unknown>;
  const str = (k: string) => (typeof o[k] === "string" ? o[k] : "");
  const strArr = (k: string) => (Array.isArray(o[k]) ? o[k].map(String) : []);
  const numOrNull = (k: string) => {
    const n = o[k];
    if (n === null || n === undefined) return null;
    if (typeof n === "number" && Number.isFinite(n)) return n;
    if (typeof n === "string" && n.trim() !== "" && Number.isFinite(Number(n))) return Number(n);
    return null;
  };
  return {
    title: str("title"),
    discipline: str("discipline"),
    region: str("region"),
    location: str("location"),
    dates: strArr("dates"),
    durationDays: numOrNull("durationDays") as number | null,
    price: numOrNull("price") as number | null,
    level: str("level"),
    riskLevel: str("riskLevel"),
    included: strArr("included"),
    notIncluded: strArr("notIncluded"),
    equipmentRequired: strArr("equipmentRequired"),
    medicalRestrictions: strArr("medicalRestrictions"),
    dailyProgram: strArr("dailyProgram"),
    organizer: str("organizer"),
    cancellationTerms: str("cancellationTerms"),
    missingFields: strArr("missingFields"),
    confidence: typeof o.confidence === "number" && o.confidence >= 0 && o.confidence <= 1 ? o.confidence : 0,
  };
}

const SYSTEM = `Ты извлекаешь структуру туристической/спортивной программы из сырого текста.
Правила:
- Не выдумывай факты. Если поля нет в тексте — пустая строка, null или [] и добавь имя поля в missingFields.
- confidence: число 0..1 — уверенность в извлечённых фактах.
- Верни ТОЛЬКО валидный JSON по схеме: title, discipline, region, location, dates (массив строк), durationDays, price, level, riskLevel, included, notIncluded, equipmentRequired, medicalRestrictions, dailyProgram, organizer, cancellationTerms, missingFields, confidence.`;

export async function normalizeProgram(
  env: Env,
  input: { text: string; sourceUrl?: string; discipline?: string; region?: string }
): Promise<{ data: NormalizedProgram; source: "llm" | "fallback"; reason?: string }> {
  const ctx = `Исходник:\n${input.text}\n\nСсылка: ${input.sourceUrl ?? ""}\nДисциплина (подсказка): ${input.discipline ?? ""}\nРегион (подсказка): ${input.region ?? ""}`;
  const r = await callOpenAiJson(
    env,
    [
      { role: "system", content: SYSTEM },
      { role: "user", content: ctx },
    ],
    { timeoutMs: 60_000 }
  );
  if (r.ok) {
    return { data: coerceNormalized(r.json), source: "llm" };
  }
  const missingFields: string[] = ["ai_unavailable"];
  if (input.text?.trim()) missingFields.push("raw_text_pending_parse");
  return {
    data: {
      ...EMPTY,
      missingFields,
      confidence: 0,
    },
    source: "fallback",
    reason: r.reason,
  };
}
