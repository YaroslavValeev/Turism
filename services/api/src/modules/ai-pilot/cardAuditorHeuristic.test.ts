import { describe, it, expect } from "vitest";
import { auditCardHeuristic, mergeAuditWithSafety } from "./cardAuditorHeuristic";

describe("auditCardHeuristic", () => {
  it("пустая карточка — низкий score и много дыр", () => {
    const r = auditCardHeuristic({});
    expect(r.criticalMissing.length).toBeGreaterThan(3);
    expect(r.status).toMatch(/draft|needs_review/);
  });

  it("с заполненными полями — выше score", () => {
    const r = auditCardHeuristic({
      title: "Кайт-лагерь",
      dates: ["2025-08-01"],
      price: 10000,
      location: "Анапа",
      durationDays: 3,
      level: "intermediate",
      riskLevel: "medium",
      equipmentRequired: ["кайт", "трапеция"],
      medicalRestrictions: ["без сильных нарушений зрения"],
      cancellationTerms: "за 14 дней 100%",
      organizer: "ИП Иванов",
      included: ["питание"],
      notIncluded: ["трансфер"],
    });
    expect(r.score).toBeGreaterThan(40);
  });
});

describe("mergeAuditWithSafety", () => {
  it("поднимает риск при high safety", () => {
    const base = auditCardHeuristic({ title: "X" });
    const m = mergeAuditWithSafety(base, "high");
    expect(m.publicationRisks.length).toBeGreaterThanOrEqual(base.publicationRisks.length);
  });
});
