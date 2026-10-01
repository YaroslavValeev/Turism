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
  scheduleType?: string;
  seasonLabel?: string | null;
  capacityTotal: number | null;
  spotsAvailable: number | null;
  isStarred: boolean;
  priceFromRub?: number | null;
  currency?: string | null;
  exactLocation?: string | null;
  audienceFit?: string | null;
  itineraryDayByDay?: string | null;
  inclusions?: string | null;
  exclusions?: string | null;
  gearRequirements?: string | null;
  cancellationRules?: string | null;
  manualFields?: string[];
  aiEnrichment?: { generatedAt?: string; fields?: string[]; notes?: Partial<MyWaveNotes> } | null;
  media: ProgramMediaItem[];
  organizer?: { id: string; displayName: string; verificationStatus: string };
};

/** Рекомендации MyWave из ИИ-автозаполнения: сайт показывает их серым курсивом, когда организатор ничего не написал. */
export type MyWaveNotes = {
  general: string[];
  audience: string;
  accommodation: string;
  transfer: string;
  gear: string;
  cancellation: string;
};

/** Тот же блок, к которому сайт привязывает примечание (apps/web program-pdp). */
export function myWaveNoteForField(p: Program, key: string): string {
  const notes = p.aiEnrichment?.notes;
  if (!notes) return "";
  switch (key) {
    case "audienceFit":
      return notes.audience?.trim() ?? "";
    case "gearRequirements":
      return notes.gear?.trim() ?? "";
    case "cancellationRules":
      return notes.cancellation?.trim() ?? "";
    case "inclusions":
      return [notes.accommodation, notes.transfer].map((s) => s?.trim()).filter(Boolean).join(" ");
    default:
      return "";
  }
}

/** Совпадает с PUBLIC_HORIZON_DAYS в API: дальше этого срока программа опубликована, но на сайте не видна. */
export const PUBLIC_HORIZON_DAYS = 183;

export function storefrontVisibleFrom(startDate: string, now = new Date()): Date | null {
  const start = new Date(startDate);
  if (Number.isNaN(start.getTime())) return null;
  const day = 24 * 60 * 60 * 1000;
  const startDay = Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate());
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const opensAt = startDay - PUBLIC_HORIZON_DAYS * day;
  return opensAt > today ? new Date(opensAt) : null;
}

/** Подпись поля: правлено вручную (сбор и ИИ не трогают) или заполнено ИИ по посту. */
export function cardFieldOrigin(p: Program, key: string): "manual" | "ai" | null {
  if (p.manualFields?.includes(key)) return "manual";
  if (p.aiEnrichment?.fields?.includes(key)) return "ai";
  return null;
}

export type ProgramMediaItem = {
  id: string;
  mediaType: string;
  url: string;
  caption?: string | null;
  position?: number;
};

/** Порядок id после перемещения медиа с from на to; первый id — обложка карточки. */
export function reorderMediaIds(media: ReadonlyArray<ProgramMediaItem>, from: number, to: number): string[] {
  const ids = media.map((item) => item.id);
  if (from < 0 || from >= ids.length || to < 0 || to >= ids.length || from === to) return ids;
  const [moved] = ids.splice(from, 1);
  ids.splice(to, 0, moved!);
  return ids;
}

export const PROGRAM_CARD_TEXT_FIELDS = [
  { key: "title", label: "Название", multiline: false },
  { key: "region", label: "Регион", multiline: false },
  { key: "exactLocation", label: "Точное место", multiline: false },
  { key: "audienceFit", label: "Описание / для кого", multiline: true },
  { key: "itineraryDayByDay", label: "Программа по дням", multiline: true },
  { key: "inclusions", label: "Включено", multiline: true },
  { key: "exclusions", label: "Не включено", multiline: true },
  { key: "gearRequirements", label: "Снаряжение", multiline: true },
  { key: "cancellationRules", label: "Условия отмены", multiline: true },
] as const;

export type ProgramCardTextKey = (typeof PROGRAM_CARD_TEXT_FIELDS)[number]["key"];

const REQUIRED_CARD_TEXT_KEYS: readonly ProgramCardTextKey[] = ["title", "region"];

export type ProgramCardDraft = Record<ProgramCardTextKey, string> & {
  startDate: string;
  endDate: string;
  durationDays: string;
  onRequest: boolean;
  seasonLabel: string;
};

function toDateInput(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toISOString().slice(0, 10);
}

/** Служебные заглушки сбора (сайт их скрывает) — в редакторе показываем как пустое поле. */
const INGESTION_PLACEHOLDERS = [
  /^требует\s+ручно(?:го\s+заполнения|й\s+нормализации)/i,
  /^базовая программа и сопровождение организатора\.\s*детальный состав/i,
];

export function isIngestionPlaceholder(value: string): boolean {
  const text = value.trim();
  return text !== "" && INGESTION_PLACEHOLDERS.some((re) => re.test(text));
}

export function cardDraftFromProgram(p: Program): ProgramCardDraft {
  const text = Object.fromEntries(
    PROGRAM_CARD_TEXT_FIELDS.map(({ key }) => {
      const value = String((p as Record<string, unknown>)[key] ?? "");
      return [key, isIngestionPlaceholder(value) ? "" : value];
    }),
  ) as Record<ProgramCardTextKey, string>;
  return {
    ...text,
    startDate: toDateInput(p.startDate),
    endDate: toDateInput(p.endDate),
    durationDays: String(p.durationDays ?? ""),
    onRequest: p.scheduleType === "on_request",
    seasonLabel: p.seasonLabel ?? "",
  };
}

/** Only changed fields go to PATCH so the audit log stays meaningful. */
export function cardPatchFromDraft(p: Program, draft: ProgramCardDraft): Record<string, unknown> {
  const saved = cardDraftFromProgram(p);
  const patch: Record<string, unknown> = {};
  for (const { key } of PROGRAM_CARD_TEXT_FIELDS) {
    if (draft[key] === saved[key]) continue;
    patch[key] = REQUIRED_CARD_TEXT_KEYS.includes(key) ? draft[key].trim() : draft[key].trim() || null;
  }
  if (draft.startDate !== saved.startDate) patch.startDate = draft.startDate;
  if (draft.endDate !== saved.endDate) patch.endDate = draft.endDate;
  if (draft.durationDays !== saved.durationDays) patch.durationDays = Number(draft.durationDays);
  if (draft.onRequest !== saved.onRequest) patch.scheduleType = draft.onRequest ? "on_request" : "fixed";
  if (draft.seasonLabel.trim() !== saved.seasonLabel.trim()) patch.seasonLabel = draft.seasonLabel.trim() || null;
  return patch;
}

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
  currency: string;
};

export const CURRENCY_OPTIONS = ["RUB", "USD", "EUR", "KZT", "GEL", "TRY", "AED", "THB", "IDR", "CNY"];

export type PriceDraft = {
  price: string;
  currency: string;
};

export function priceDraftFromProgram(p: Pick<Program, "priceFromRub" | "currency">): PriceDraft {
  return {
    price: p.priceFromRub != null ? String(p.priceFromRub) : "",
    currency: (p.currency ?? "RUB").toUpperCase(),
  };
}

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
  currency: "RUB",
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
