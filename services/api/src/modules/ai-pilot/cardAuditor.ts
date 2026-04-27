import type { Env } from "@mywave/config";
import { auditCardHeuristic, mergeAuditWithSafety } from "./cardAuditorHeuristic";
import { callOpenAiJson } from "./openaiJson";
import { checkSafetyHeuristic } from "./safetyHeuristic";

const SYSTEM = `Ты аудитор готовности карточки программы к публикации на MyWave.
Верни JSON: { "score": 0-100, "status": "draft"|"needs_review"|"ready", "criticalMissing": [], "recommendedImprovements": [], "publicationRisks": [] }
Оцени только по переданной карточке; не выдумывай факты. Критично: даты, цена, локация, риск, отмена, экипировка, мед. ограничения, кто ведёт, что включено.`;

type AuditorJson = {
  score: number;
  status: "draft" | "needs_review" | "ready";
  criticalMissing: string[];
  recommendedImprovements: string[];
  publicationRisks: string[];
};

function coerceAuditor(o: unknown): AuditorJson | null {
  if (!o || typeof o !== "object") return null;
  const r = o as Record<string, unknown>;
  const st = r.status;
  if (st !== "draft" && st !== "needs_review" && st !== "ready") return null;
  return {
    score: typeof r.score === "number" && r.score >= 0 && r.score <= 100 ? r.score : 0,
    status: st,
    criticalMissing: Array.isArray(r.criticalMissing) ? r.criticalMissing.map(String) : [],
    recommendedImprovements: Array.isArray(r.recommendedImprovements) ? r.recommendedImprovements.map(String) : [],
    publicationRisks: Array.isArray(r.publicationRisks) ? r.publicationRisks.map(String) : [],
  };
}

export async function runCardAuditor(
  env: Env,
  card: Record<string, unknown>
): Promise<{
  data: AuditorJson;
  source: "llm" | "heuristic";
}> {
  const textBlob = [card.title, card.description, card.cancellationTerms, card.organizer]
    .filter((x) => typeof x === "string")
    .join("\n");
  const safety = checkSafetyHeuristic(textBlob);
  const heur = mergeAuditWithSafety(auditCardHeuristic(card), safety.severity);
  if (!env.OPENAI_API_KEY?.trim() || !env.AI_ENABLED) {
    return {
      data: {
        score: heur.score,
        status: heur.status,
        criticalMissing: heur.criticalMissing,
        recommendedImprovements: heur.recommendedImprovements,
        publicationRisks: heur.publicationRisks,
      },
      source: "heuristic",
    };
  }
  const r = await callOpenAiJson(
    env,
    [
      { role: "system", content: SYSTEM },
      { role: "user", content: `Карточка (JSON):\n${JSON.stringify(card).slice(0, 20_000)}` },
    ],
    { timeoutMs: 45_000 }
  );
  if (r.ok) {
    const parsed = coerceAuditor(r.json);
    if (parsed) {
      if (safety.severity === "high" && parsed.status === "ready") {
        parsed.status = "needs_review";
        parsed.publicationRisks = [
          ...parsed.publicationRisks,
          "По safety: в тексте есть жёсткие или юридически рискованные формулировки.",
        ];
      }
      return { data: parsed, source: "llm" };
    }
  }
  return {
    data: {
      score: heur.score,
      status: heur.status,
      criticalMissing: heur.criticalMissing,
      recommendedImprovements: heur.recommendedImprovements,
      publicationRisks: heur.publicationRisks,
    },
    source: "heuristic",
  };
}
