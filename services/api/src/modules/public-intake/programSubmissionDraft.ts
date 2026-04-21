/**
 * Валидация расширенной заявки организатора (мастер карточки) для intakeType=program_submission.
 * Полный publish gate включает медиа и organizerId — на этапе intake их заполняет оператор.
 */
import { inclusiveDurationDaysUTC } from "@mywave/shared-types";

export type SupplyTrack = "standard" | "verified_style";

export type ProgramDraftV2 = {
  exactLocation?: string;
  startDate?: string;
  endDate?: string;
  durationDays?: number;
  levelRequired?: string;
  riskLevel?: string;
  gearRequirements?: string;
  medicalLimitations?: string | null;
  cancellationRules?: string;
  audienceFit?: string;
  inclusions?: string;
  exclusions?: string;
  itineraryDayByDay?: string;
  formatType?: string;
  priceFromRub?: number | null;
  currency?: string;
  organizerDisplayName?: string;
  trustReason?: string;
  reviewsSummary?: string;
  whatHappensAfterBooking?: string;
  cta?: string;
};

export type ProgramIntakeMetaV2 = {
  wizardVersion: 2;
  supplyTrack: SupplyTrack;
  programDraft: ProgramDraftV2;
};

function trim(s: unknown): string {
  return String(s ?? "").trim();
}

function filled(s: unknown): boolean {
  return trim(s) !== "";
}

function isIsoDate(s: string): boolean {
  const d = new Date(s);
  return !Number.isNaN(d.getTime());
}

export function parseProgramIntakeMetaV2(body: Record<string, unknown>): ProgramIntakeMetaV2 | null {
  const meta = body.meta;
  if (meta == null || typeof meta !== "object" || Array.isArray(meta)) return null;
  const m = meta as Record<string, unknown>;
  if (Number(m.wizardVersion) !== 2) return null;
  const supplyTrack = trim(m.supplyTrack) as SupplyTrack;
  if (supplyTrack !== "standard" && supplyTrack !== "verified_style") return null;
  const draft = m.programDraft;
  if (draft == null || typeof draft !== "object" || Array.isArray(draft)) return null;
  return {
    wizardVersion: 2,
    supplyTrack,
    programDraft: draft as ProgramDraftV2,
  };
}

/** Разбор meta из строки БД (public_organizer_intakes.meta). */
export function parseStoredProgramIntakeMeta(meta: unknown): ProgramIntakeMetaV2 | null {
  if (meta == null || typeof meta !== "object" || Array.isArray(meta)) return null;
  return parseProgramIntakeMetaV2({ meta } as Record<string, unknown>);
}

export function validateProgramSubmissionDraft(meta: ProgramIntakeMetaV2): string | null {
  const d = meta.programDraft;
  if (!filled(d.exactLocation)) return "exactLocation required in programDraft";
  if (!filled(d.startDate) || !isIsoDate(String(d.startDate))) return "valid startDate (ISO) required in programDraft";
  if (!filled(d.endDate) || !isIsoDate(String(d.endDate))) return "valid endDate (ISO) required in programDraft";
  const start = new Date(String(d.startDate));
  const end = new Date(String(d.endDate));
  let computedDays: number;
  try {
    computedDays = inclusiveDurationDaysUTC(start, end);
  } catch {
    return "startDate must be on or before endDate";
  }
  if (d.durationDays != null && Number.isFinite(Number(d.durationDays)) && Number(d.durationDays) !== computedDays) {
    return "durationDays must match inclusive calendar from startDate to endDate (or omit durationDays)";
  }
  if (!filled(d.levelRequired)) return "levelRequired required in programDraft";
  if (!filled(d.riskLevel)) return "riskLevel required in programDraft";
  if (!filled(d.gearRequirements)) return "gearRequirements required in programDraft";
  if (d.medicalLimitations === undefined || d.medicalLimitations === null) {
    return "medicalLimitations must be set in programDraft (use empty string if N/A)";
  }
  if (!filled(d.cancellationRules)) return "cancellationRules required in programDraft";
  const hasSummary = filled(d.audienceFit) || filled(d.inclusions) || filled(d.itineraryDayByDay);
  if (!hasSummary) return "at least one of audienceFit, inclusions, itineraryDayByDay required in programDraft";

  if (meta.supplyTrack === "verified_style") {
    if (!filled(d.formatType)) return "formatType required for verified_style";
    if (d.priceFromRub == null || Number.isNaN(Number(d.priceFromRub))) return "priceFromRub required for verified_style";
    if (!filled(d.currency)) return "currency required for verified_style";
    if (!filled(d.audienceFit)) return "audienceFit required for verified_style";
    if (!filled(d.inclusions)) return "inclusions required for verified_style";
    if (!filled(d.exclusions)) return "exclusions required for verified_style";
    if (!filled(d.itineraryDayByDay)) return "itineraryDayByDay required for verified_style";
    if (!filled(d.organizerDisplayName)) return "organizerDisplayName required for verified_style";
    if (!filled(d.trustReason)) return "trustReason required for verified_style";
    if (!filled(d.reviewsSummary)) return "reviewsSummary required for verified_style";
    if (!filled(d.whatHappensAfterBooking)) return "whatHappensAfterBooking required for verified_style";
    if (!filled(d.cta)) return "cta required for verified_style";
  }

  return null;
}

export function buildProgramSubmissionMessage(meta: ProgramIntakeMetaV2, freeformMessage: string): string {
  const d = meta.programDraft;
  const lines: string[] = [
    "--- Структурированная заявка (wizard v2) ---",
    `Трек: ${meta.supplyTrack === "verified_style" ? "verified / trusted (расширенный слой)" : "стандартная подача"}`,
    "",
    "Локация и даты:",
    `- Точное место: ${trim(d.exactLocation)}`,
    `- С: ${trim(d.startDate)}`,
    `- По: ${trim(d.endDate)}`,
    `- Дней (по календарю): ${String(inclusiveDurationDaysUTC(new Date(String(d.startDate)), new Date(String(d.endDate))))}`,
    "",
    "Уровень и безопасность:",
    `- Уровень: ${trim(d.levelRequired)}`,
    `- Риск: ${trim(d.riskLevel)}`,
    `- Экипировка: ${trim(d.gearRequirements)}`,
    `- Медицина / ограничения: ${d.medicalLimitations === null || d.medicalLimitations === undefined ? "—" : String(d.medicalLimitations)}`,
    `- Отмена / условия: ${trim(d.cancellationRules)}`,
    "",
    "Содержание:",
    `- Для кого: ${filled(d.audienceFit) ? trim(d.audienceFit) : "—"}`,
    `- Включено: ${filled(d.inclusions) ? trim(d.inclusions) : "—"}`,
    `- План по дням: ${filled(d.itineraryDayByDay) ? trim(d.itineraryDayByDay) : "—"}`,
  ];

  if (meta.supplyTrack === "verified_style") {
    lines.push(
      "",
      "Расширенный слой (verified-style):",
      `- Формат: ${trim(d.formatType)}`,
      `- Цена от: ${String(d.priceFromRub)} ${trim(d.currency)}`,
      `- Исключения: ${trim(d.exclusions)}`,
      `- Имя организатора в карточке: ${trim(d.organizerDisplayName)}`,
      `- Доверие: ${trim(d.trustReason)}`,
      `- Отзывы / репутация: ${trim(d.reviewsSummary)}`,
      `- После заявки: ${trim(d.whatHappensAfterBooking)}`,
      `- CTA: ${trim(d.cta)}`,
    );
  }

  if (trim(freeformMessage)) {
    lines.push("", "Комментарий организатора:", trim(freeformMessage));
  }

  return lines.join("\n");
}
