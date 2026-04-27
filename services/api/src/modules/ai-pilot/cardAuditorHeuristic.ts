import type { SafetySeverity } from "./safetyHeuristic";

type Status = "draft" | "needs_review" | "ready";

function nonempty(v: unknown): boolean {
  if (v === null || v === undefined) return false;
  if (typeof v === "string") return v.trim().length > 0;
  if (typeof v === "number") return Number.isFinite(v);
  if (Array.isArray(v)) return v.length > 0;
  if (typeof v === "object") return Object.keys(v as object).length > 0;
  return true;
}

/**
 * Без LLM: оценка готовности карточки по полям. Используется как fallback и для тестов.
 */
export function auditCardHeuristic(card: Record<string, unknown>): {
  score: number;
  status: Status;
  criticalMissing: string[];
  recommendedImprovements: string[];
  publicationRisks: string[];
} {
  const criticalMissing: string[] = [];
  const recommended: string[] = [];
  const risks: string[] = [];
  const req = [
    { key: "title", name: "название" },
    { key: "dates", name: "даты" },
    { key: "price", name: "цена" },
    { key: "location", name: "локация" },
    { key: "durationDays", name: "длительность" },
    { key: "level", name: "уровень подготовки" },
    { key: "riskLevel", name: "уровень риска" },
    { key: "equipmentRequired", name: "экипировка" },
    { key: "medicalRestrictions", name: "мед. ограничения" },
    { key: "cancellationTerms", name: "условия отмены" },
    { key: "organizer", name: "организатор" },
    { key: "included", name: "включено" },
    { key: "notIncluded", name: "не включено" },
  ];
  for (const { key, name } of req) {
    if (!nonempty(card[key])) criticalMissing.push(name);
  }
  if (!nonempty(card.photos) && !nonempty(card.media) && !nonempty(card.videoUrl) && !nonempty(card.coverImageUrl)) {
    criticalMissing.push("фото/видео");
    recommended.push("Добавьте обложку и медиа для доверия.");
  }
  if (!nonempty(card.organizerContact) && !nonempty(card.contact) && !nonempty(card["contactEmail"])) {
    criticalMissing.push("контакт организатора");
  }
  if (!nonempty(card.cta) && !nonempty(card.callToAction)) {
    recommended.push("Сформулируйте явный CTA (кнопка / следующий шаг).");
  }
  if (criticalMissing.length > 4) {
    risks.push("Много пустых полей — риск недопонимания и споров.");
  }

  const weightMain = 5;
  const score = Math.max(0, Math.min(100, 100 - criticalMissing.length * weightMain));

  let status: Status = "ready";
  if (score < 40 || criticalMissing.length > 6) status = "draft";
  else if (score < 70 || criticalMissing.length > 0) status = "needs_review";
  if (status === "ready" && criticalMissing.length) status = "needs_review";

  return {
    score,
    status,
    criticalMissing,
    recommendedImprovements: recommended,
    publicationRisks: risks,
  };
}

/**
 * Склейка эвристики + опциональная подстраховка уровня из severity safety (если передадут).
 */
export function mergeAuditWithSafety(
  base: ReturnType<typeof auditCardHeuristic>,
  safetySeverity: SafetySeverity | undefined
): ReturnType<typeof auditCardHeuristic> {
  if (safetySeverity === "high") {
    return {
      ...base,
      status: base.status === "ready" ? "needs_review" : base.status,
      publicationRisks: [
        ...base.publicationRisks,
        "По safety-тексту: есть формулировки, требующие ручной проверки перед публикацией.",
      ],
    };
  }
  if (safetySeverity === "medium" && base.status === "ready") {
    return { ...base, status: "needs_review" };
  }
  return base;
}
