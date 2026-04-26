export type OrganizerOption = {
  id: string;
  displayName: string;
  verificationStatus: string;
};

export type ProgramScoreSnap = {
  programId: string;
  totalProgramScore: number;
  scoreBand: string;
  sampleViews?: number;
  componentsJson?: Record<string, number | null>;
};

export type Program = {
  id: string;
  title: string;
  discipline: string;
  region: string;
  publishStatus: string;
  intakeSource: string | null;
  startDate: string;
  endDate: string;
  durationDays: number;
  capacityTotal: number | null;
  spotsAvailable: number | null;
  isStarred: boolean;
  media: unknown[];
  organizer?: { id: string; displayName: string; verificationStatus: string };
};

export type ProgramForm = {
  organizerId: string;
  intakeSource: string;
  title: string;
  discipline: string;
  region: string;
  exactLocation: string;
  startDate: string;
  endDate: string;
  durationDays: string;
  levelRequired: string;
  riskLevel: string;
  capacityTotal: string;
  spotsAvailable: string;
  isStarred: boolean;
  gearRequirements: string;
  medicalLimitations: string;
  cancellationRules: string;
  itineraryDayByDay: string;
  inclusions: string;
  priceFromRub: string;
};

export type MediaDraft = {
  mediaType: string;
  url: string;
  caption: string;
};

export type AvailabilityDraft = {
  capacityTotal: string;
  spotsAvailable: string;
};

export type SpotlightDraft = {
  isStarred: boolean;
};

export const EMPTY_MEDIA_DRAFT: MediaDraft = {
  mediaType: "image",
  url: "",
  caption: "",
};

export const LEVEL_OPTIONS = ["beginner", "intermediate", "advanced", "expert", "all_levels"];
export const RISK_LEVEL_OPTIONS = ["low", "medium", "high", "critical"];

export const INITIAL_PROGRAM_FORM: ProgramForm = {
  organizerId: "",
  intakeSource: "admin_manual",
  title: "",
  discipline: "Wakesurf",
  region: "Krasnodar",
  exactLocation: "",
  startDate: "",
  endDate: "",
  durationDays: "3",
  levelRequired: "intermediate",
  riskLevel: "medium",
  capacityTotal: "",
  spotsAvailable: "",
  isStarred: false,
  gearRequirements: "Доска/оборудование согласуются с организатором",
  medicalLimitations: "",
  cancellationRules: "Бесплатная отмена за 14 дней, далее по договорённости с организатором.",
  itineraryDayByDay: "День 1: знакомство и брифинг. День 2–3: катание, разбор техники, восстановление.",
  inclusions: "Тренировки, сопровождение организатора, координация от MyWave.",
  priceFromRub: "",
};

export function programBandLabel(scoreBand: string | undefined): string {
  if (scoreBand === "low") return "Слабая карточка";
  if (scoreBand === "medium") return "Наблюдение";
  if (scoreBand === "insufficient_data" || scoreBand === "unknown") {
    return "Недостаточно данных";
  }
  return "Стабильно";
}

export function programBandPillClass(scoreBand: string | undefined): string {
  if (scoreBand === "low") return "mw-admin-pill--score-low";
  if (scoreBand === "medium") return "mw-admin-pill--score-medium";
  if (scoreBand === "insufficient_data" || scoreBand === "unknown") {
    return "mw-admin-pill--score-insufficient";
  }
  return "mw-admin-pill--score-stable";
}

export function programBreakdown(score: ProgramScoreSnap | undefined): string {
  if (!score) return "Снимок оценки ещё не рассчитан.";
  const c = score.componentsJson ?? {};
  const content = Number(c.content_completeness_score ?? 0);
  const media = Number(c.has_media_score ?? 0);
  const safety = Number(c.has_safety_score ?? 0);
  const cancellation = Number(c.has_cancellation_policy_score ?? 0);
  const v2l = c.view_to_lead_score == null ? null : Number(c.view_to_lead_score);
  const l2b = c.lead_to_booking_score == null ? null : Number(c.lead_to_booking_score);
  const b2p = c.booking_to_paid_score == null ? null : Number(c.booking_to_paid_score);
  return `Контент ${content.toFixed(0)} · медиа ${media.toFixed(0)} · безопасность ${safety.toFixed(0)} · отмена ${cancellation.toFixed(0)} · воронка: ${v2l == null ? "—" : v2l.toFixed(0)}/${l2b == null ? "—" : l2b.toFixed(0)}/${b2p == null ? "—" : b2p.toFixed(0)}`;
}

export function programHints(program: Program, score: ProgramScoreSnap | undefined): string[] {
  if (!score) return ["Снимок оценки ещё не создан — запустите пересчёт."];
  const hints: string[] = [];
  const c = score.componentsJson ?? {};
  if (score.scoreBand === "insufficient_data" || score.scoreBand === "unknown") {
    hints.push("Недостаточно трафика для оценки эффективности: нужна выборка просмотров.");
  }
  if (Number(c.content_completeness_score ?? 100) < 70) {
    hints.push("Слабая полнота текста: дополните описание, включения, снаряжение, что после брони.");
  }
  if (Number(c.has_media_score ?? 100) < 100) {
    hints.push("Добавьте фото/видео — без медиа карточка хуже конвертит.");
  }
  if (Number(c.has_schedule_score ?? 100) < 100) hints.push("Добавьте программу по дням (маршрут).");
  if (Number(c.has_safety_score ?? 100) < 100) {
    hints.push("Заполните риски и медицинские ограничения (доверие).");
  }
  if (Number(c.has_cancellation_policy_score ?? 100) < 100) hints.push("Уточните политику отмены и возврата.");
  if ((c.booking_to_paid_score ?? 100) !== null && Number(c.booking_to_paid_score ?? 100) < 55) {
    hints.push("Слабая стадия «заявка → оплата»: проверьте офер и сопровождение гостя.");
  }
  if (program.publishStatus !== "published") {
    hints.push("Карточка не опубликована — проверьте требования к публикации.");
  }
  return hints.slice(0, 3);
}

export function moderationPriorityForProgram(
  score: ProgramScoreSnap | undefined,
): { label: string; tone: "ok" | "warn" | "danger" | "muted" } {
  if (!score) return { label: "P3 — ждём снимок оценки", tone: "muted" };
  if (score.scoreBand === "low") return { label: "P1 — срочная проверка модерацией", tone: "danger" };
  if (score.scoreBand === "insufficient_data" || score.scoreBand === "unknown") {
    return { label: "P2 — трафик и выборка данных", tone: "warn" };
  }
  if (score.scoreBand === "medium") return { label: "P2 — доработка качества", tone: "warn" };
  return { label: "P3 — мониторинг", tone: "muted" };
}

/** Короткий текст для бейджа в таблице (совпадает по смыслу с `moderationPriorityForProgram.label`). */
export function moderationPriorityLabel(score: ProgramScoreSnap | undefined): string {
  return moderationPriorityForProgram(score).label;
}
