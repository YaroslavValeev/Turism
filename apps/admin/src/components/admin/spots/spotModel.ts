export const SPOT_CATEGORIES = [
  { id: "infrastructure", label: "Инфраструктура", weight: 25 },
  { id: "instrument", label: "Инструмент (лодка и волна)", weight: 25 },
  { id: "waterArea", label: "Акватория", weight: 15 },
  { id: "personnel", label: "Персонал", weight: 15 },
  { id: "safety", label: "Безопасность", weight: 10 },
  { id: "atmosphere", label: "Атмосфера", weight: 10 },
] as const;

export const SPOT_GATES = [
  { id: "G01", label: "Рабочий инструмент" },
  { id: "G02", label: "Безопасная акватория" },
  { id: "G03", label: "Закрытая раздевалка" },
  { id: "G04", label: "Туалет" },
  { id: "G05", label: "Горячий душ" },
  { id: "G06", label: "Инструктаж по безопасности" },
  { id: "G07", label: "Аптечка и спасательные средства" },
  { id: "G08", label: "Система безопасности" },
] as const;

export type GateStatus = "pass" | "fail" | "unknown";

export const GATE_STATUS_LABEL: Record<GateStatus, string> = {
  pass: "Есть",
  fail: "Нет",
  unknown: "Не проверено",
};

export const AUDIT_STATUS_LABEL: Record<string, string> = {
  draft: "Черновик",
  submitted: "Ждёт подписи",
  signed: "Подписан",
  void: "Аннулирован",
};

export const DISCOVERY_STATUS_LABEL: Record<string, string> = {
  candidate: "Кандидат",
  listed: "В каталоге",
  archived: "Архив",
};

export const WATER_BODY_LABEL: Record<string, string> = {
  lake: "Озеро",
  river: "Река",
  reservoir: "Водохранилище",
  sea: "Море",
  bay: "Залив",
};

export const BAND_LABEL: Record<string, string> = {
  premium_plus: "Премиум+",
  premium: "Премиум",
  standard: "Стандарт",
  basic: "Базовый",
  below_standard: "Ниже стандарта",
};

const BLOCKER_LABEL: Record<string, string> = {
  methodology_not_approved: "Методика не утверждена для публикации",
  professional_test_missing: "Аудит не отправлен",
  expert_signature_missing: "Нет подписи эксперта",
  criterion_evidence_missing: "Не по всем категориям есть доказательства",
  evidence_integrity_not_confirmed: "Целостность доказательств подтверждена не у всех",
  test_expired: "Тест старше 12 месяцев",
  related_spot_external_expert_missing: "Спот связан с MyWave: нужен внешний эксперт",
  related_spot_independent_editor_missing: "Спот связан с MyWave: нужен независимый редактор",
};

export function blockerLabel(code: string): string {
  if (BLOCKER_LABEL[code]) return BLOCKER_LABEL[code];
  const gate = /^mandatory_gate_(failed|unknown):(G0[1-8])$/.exec(code);
  if (gate) {
    const name = SPOT_GATES.find((g) => g.id === gate[2])?.label ?? gate[2];
    return gate[1] === "failed" ? `${gate[2]} «${name}»: не выполнено` : `${gate[2]} «${name}»: не проверено`;
  }
  return code;
}

export function criterionLabel(criterion: string | null): string {
  if (!criterion) return "Общее";
  const category = SPOT_CATEGORIES.find((c) => c.id === criterion);
  if (category) return category.label;
  const gate = SPOT_GATES.find((g) => g.id === criterion);
  return gate ? `${gate.id} ${gate.label}` : criterion;
}

/** Принимает формат копирования из Яндекс Карт: «55.751244, 37.618423» (или через пробел). */
export function parseCoordinates(text: string): { latitude: number; longitude: number } | null | "invalid" {
  const trimmed = text.trim();
  if (!trimmed) return null;
  const parts = trimmed.split(/[\s,;]+/).filter(Boolean);
  if (parts.length !== 2) return "invalid";
  const [latitude, longitude] = parts.map(Number);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return "invalid";
  if (Math.abs(latitude) > 90 || Math.abs(longitude) > 180) return "invalid";
  return { latitude, longitude };
}

export function formatCoordinates(latitude: string | number | null, longitude: string | number | null): string {
  if (latitude == null || longitude == null) return "";
  return `${Number(latitude)}, ${Number(longitude)}`;
}

export function yandexMapsUrl(latitude: string | number, longitude: string | number): string {
  return `https://yandex.ru/maps/?pt=${Number(longitude)},${Number(latitude)}&z=15&l=map`;
}

export interface AuditForReadiness {
  status: string;
  expertUserId: string | null;
  externalExpertConfirmed: boolean;
  independentEditorUserId: string | null;
  categoryScores: Array<{ category: string }>;
  gateResults: Array<{ gateId: string; status: string }>;
  evidence: Array<{ criterion: string | null; isGenerated: boolean; integrityConfirmedAt: string | null }>;
  remediations: Array<{ gateId: string; accepted: boolean }>;
}

export interface ReadinessItem {
  label: string;
  ok: boolean;
}

/** Подсказка оператору, чего не хватает для публикуемого снимка; решение всё равно принимает движок в API. */
export function auditReadiness(audit: AuditForReadiness, relatedToMyWave: boolean): ReadinessItem[] {
  const missingScores = SPOT_CATEGORIES.filter((c) => !audit.categoryScores.some((s) => s.category === c.id));
  const g05Remediated = audit.remediations.some((r) => r.gateId === "G05" && r.accepted);
  const badGates = SPOT_GATES.filter((g) => {
    if (g.id === "G05" && g05Remediated) return false;
    return audit.gateResults.find((r) => r.gateId === g.id)?.status !== "pass";
  });
  const authentic = audit.evidence.filter((e) => !e.isGenerated);
  const missingEvidence = SPOT_CATEGORIES.filter((c) => !authentic.some((e) => e.criterion === c.id));
  const unconfirmed = audit.evidence.filter((e) => e.isGenerated || !e.integrityConfirmedAt).length;

  const items: ReadinessItem[] = [
    {
      label: missingScores.length ? `Оценки: нет ${missingScores.map((c) => c.label).join(", ")}` : "Оценки по 6 категориям",
      ok: missingScores.length === 0,
    },
    {
      label: badGates.length ? `Обязательные гейты: ${badGates.map((g) => g.id).join(", ")}` : "Все 8 гейтов пройдены",
      ok: badGates.length === 0,
    },
    {
      label: missingEvidence.length
        ? `Доказательства: нет по ${missingEvidence.map((c) => c.label).join(", ")}`
        : "Доказательства по всем категориям",
      ok: missingEvidence.length === 0,
    },
    {
      label: audit.evidence.length === 0
        ? "Целостность: доказательств нет"
        : unconfirmed
          ? `Целостность: не подтверждено у ${unconfirmed}`
          : "Целостность всех доказательств подтверждена",
      ok: audit.evidence.length > 0 && unconfirmed === 0,
    },
    { label: audit.status === "signed" ? "Подпись эксперта" : "Нет подписи эксперта", ok: audit.status === "signed" },
  ];
  if (relatedToMyWave) {
    items.push({ label: "Внешний эксперт подтверждён", ok: audit.externalExpertConfirmed });
    items.push({
      label: "Независимый редактор (не эксперт)",
      ok: audit.independentEditorUserId != null && audit.independentEditorUserId !== audit.expertUserId,
    });
  }
  return items;
}
