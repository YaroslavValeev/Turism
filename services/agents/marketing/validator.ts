export type MarketingActionType = "create_blog" | "create_collection" | "strengthen_explore";

export type MarketingAction = {
  type: MarketingActionType;
  topic: string;
  source: string;
};

export type MarketingPlan = {
  top: string[];
  actions: MarketingAction[];
  notes: string;
  /** Уверенность модели в плане, 0..1 */
  confidence: number;
};

const VALID_TYPES: Set<MarketingActionType> = new Set([
  "create_blog",
  "create_collection",
  "strengthen_explore",
]);

/**
 * Парсит JSON-ответ модели. Если модель прислала мусор/не-JSON — вернёт null.
 */
export function parseMarketingPlan(raw: string): MarketingPlan | null {
  const body = extractJson(raw);
  if (!body) return null;
  try {
    const parsed = JSON.parse(body) as Partial<MarketingPlan>;
    if (
      !Array.isArray(parsed.top) ||
      !Array.isArray(parsed.actions) ||
      typeof parsed.notes !== "string" ||
      typeof parsed.confidence !== "number" ||
      !Number.isFinite(parsed.confidence) ||
      parsed.confidence < 0 ||
      parsed.confidence > 1
    ) {
      return null;
    }
    const top = parsed.top.filter((x): x is string => typeof x === "string" && x.trim().length > 0);
    const actions: MarketingAction[] = [];
    for (const a of parsed.actions) {
      if (!a || typeof a !== "object") continue;
      const type = (a as Partial<MarketingAction>).type;
      const topic = (a as Partial<MarketingAction>).topic;
      const source = (a as Partial<MarketingAction>).source;
      if (!type || !VALID_TYPES.has(type)) continue;
      if (typeof topic !== "string" || topic.trim().length < 4) continue;
      if (typeof source !== "string" || source.trim().length < 3) continue;
      actions.push({ type, topic: topic.trim(), source: source.trim() });
    }
    return {
      top,
      actions,
      notes: parsed.notes.trim(),
      confidence: parsed.confidence,
    };
  } catch {
    return null;
  }
}

function extractJson(raw: string): string | null {
  const t = raw.trim();
  if (!t) return null;
  if (t.startsWith("{") && t.endsWith("}")) return t;
  const start = t.indexOf("{");
  const end = t.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  return t.slice(start, end + 1);
}
