/**
 * Publish gate. Source of truth: program_card_schema.md (Required for publish).
 * Expanded: title, organizer, category/discipline, location, date/format, level, risk, gear, medical, cancellation, summary/structure, at least 1 media.
 */
import { Program, ProgramMedia } from "@prisma/client";
import { containsSyntheticMarker } from "./syntheticMarker";
import { readStoredEnrichment } from "./cardEnrichment";

export type ProgramWithMedia = Program & {
  media: ProgramMedia[];
  organizer?: { displayName: string | null } | null;
};

/**
 * Обязательный include для Prisma перед вызовом {@link canPublishAutopilot} / {@link canPublish}
 * (synthetic-проверка смотрит organizer.displayName).
 */
export const programIncludeForPublishGate = {
  media: true,
  organizer: { select: { displayName: true } },
} as const;

function filled(s: string | null | undefined): boolean {
  return s != null && String(s).trim() !== "";
}

/** Service stubs written by ingestion; the storefront hides them (apps/web recommendedProgramFields). */
const INGESTION_PLACEHOLDERS = [
  /^требует\s+ручно(?:го\s+заполнения|й\s+нормализации)/i,
  /^базовая программа и сопровождение организатора\.\s*детальный состав/i,
];

export function isIngestionPlaceholder(value: string | null | undefined): boolean {
  const text = String(value ?? "").trim();
  return text !== "" && INGESTION_PLACEHOLDERS.some((re) => re.test(text));
}

/** Filled with real organizer text, not an ingestion stub. */
function organizerFilled(value: string | null | undefined): boolean {
  return filled(value) && !isIngestionPlaceholder(value);
}

function hasSyntheticSignals(program: ProgramWithMedia): boolean {
  if (containsSyntheticMarker(program.title)) return true;
  if (containsSyntheticMarker(program.organizerName)) return true;
  if (containsSyntheticMarker(program.intakeSource)) return true;
  if (containsSyntheticMarker(program.organizer?.displayName)) return true;
  const sourceUrl = String(program.sourceUrl ?? "").trim().toLowerCase();
  return sourceUrl.includes("example.com") || sourceUrl.includes("localhost");
}

const PUBLIC_TEXT_FIELDS = [
  "title", "audienceFit", "itineraryDayByDay", "inclusions", "exclusions", "gearRequirements",
  "medicalLimitations", "cancellationRules", "whatHappensAfterBooking", "trustReason",
] as const satisfies readonly (keyof Program)[];

function containsPlaceholderOrScrapedMarkup(value: string | null | undefined): boolean {
  const text = String(value ?? "").trim().toLowerCase();
  if (!text) return false;
  return /требует\s+ручного\s+заполнения|(?:заполнить|добавить)\s+оператором|lorem\s+ipsum|todo\b|tbd\b/.test(text) ||
    /<\/?(?:style|script|link|img|source)\b|\b(?:src|href|class|style|data-[\w-]+)=["']|@media\b|font-family\s*:|(?:min|max)-width\s*:|tildacdn\.com/.test(text);
}

/**
 * Ingestion stubs are hidden on the storefront. `stubsAllowed` lists the fields where a stub
 * is treated as an empty value (the required-field checks decide) instead of a quality failure.
 */
function hasPlaceholderOrScrapedMarkup(program: ProgramWithMedia, stubsAllowed: "all" | ReadonlySet<string>): boolean {
  return PUBLIC_TEXT_FIELDS.some((field) => {
    const value = program[field] as string | null | undefined;
    if (isIngestionPlaceholder(value) && (stubsAllowed === "all" || stubsAllowed.has(field))) return false;
    return containsPlaceholderOrScrapedMarkup(value);
  });
}

function isCurrentOrFutureProgram(program: ProgramWithMedia, now = new Date()): boolean {
  if (!program.endDate) return false;
  const endDay = Date.UTC(program.endDate.getUTCFullYear(), program.endDate.getUTCMonth(), program.endDate.getUTCDate());
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return endDay >= today;
}

export function canPublish(program: ProgramWithMedia): { ok: boolean; missing: string[] } {
  const missing: string[] = [];
  if (!filled(program.title)) missing.push("title");
  if (!program.organizerId) missing.push("organizer");
  if (!filled(program.discipline)) missing.push("category/discipline");
  if (!filled(program.region)) missing.push("location (region)");
  if (!program.startDate || !program.endDate) missing.push("date (start_date, end_date)");
  if (!filled(program.levelRequired)) missing.push("level/skill level");
  if (!filled(program.riskLevel)) missing.push("risk_level");
  // The storefront shows the grey "MyWave note" when the organizer said nothing,
  // so the AI recommendation covers these blocks without inventing organizer facts.
  const notes = readStoredEnrichment(program.aiEnrichment)?.notes;
  if (!organizerFilled(program.gearRequirements) && !filled(notes?.gear)) missing.push("gear_requirements");
  if (program.medicalLimitations === undefined || program.medicalLimitations === null)
    missing.push("medical_limitations (set empty string if N/A)");
  if (!organizerFilled(program.cancellationRules) && !filled(notes?.cancellation)) missing.push("cancellation_rules");
  const hasSummary =
    organizerFilled(program.itineraryDayByDay) || organizerFilled(program.audienceFit) || organizerFilled(program.inclusions);
  if (!hasSummary) missing.push("program summary/structure (itinerary_day_by_day, audience_fit or inclusions)");
  if (!program.media?.length) missing.push("at least 1 media");
  if (hasSyntheticSignals(program)) missing.push("synthetic_markers_detected");
  // An operator publishing by hand sees the card; the admin editor shows stubs as empty fields.
  if (hasPlaceholderOrScrapedMarkup(program, "all")) missing.push("placeholder_or_scraped_markup_detected");
  return {
    ok: missing.length === 0,
    missing,
  };
}

const PUBLISH_MISSING_LABELS: Record<string, string> = {
  title: "название",
  organizer: "организатор",
  "category/discipline": "дисциплина",
  "location (region)": "регион",
  "date (start_date, end_date)": "даты начала и окончания",
  "level/skill level": "уровень подготовки",
  risk_level: "уровень риска",
  gear_requirements: "снаряжение",
  "medical_limitations (set empty string if N/A)": "медицинские ограничения",
  cancellation_rules: "условия отмены",
  "program summary/structure (itinerary_day_by_day, audience_fit or inclusions)":
    "описание (для кого, программа по дням или что включено)",
  "at least 1 media": "хотя бы одно фото или видео",
  synthetic_markers_detected: "похоже на тестовые данные (example.com, test и т.п.)",
  placeholder_or_scraped_markup_detected: "в тексте заглушки или куски HTML-разметки",
};

export function describePublishMissing(missing: readonly string[]): string {
  return missing.map((code) => PUBLISH_MISSING_LABELS[code] ?? code).join(", ");
}

/** Публикация в витрину из ingestion без ручного approve (мягче, чем canPublish). */
export function canPublishAutopilot(program: ProgramWithMedia): { ok: boolean; missing: string[] } {
  if (process.env.INGESTION_E2E_FORCE_GATE === "1") {
    return { ok: false, missing: ["e2e_forced_gate"] };
  }
  const missing: string[] = [];
  if (!filled(program.title) || String(program.title).trim().length < 2) missing.push("title");
  if (!program.organizerId) missing.push("organizer");
  if (!filled(program.discipline)) missing.push("discipline");
  if (!filled(program.region)) missing.push("region");
  if (!program.startDate || !program.endDate) missing.push("date_range");
  else if (!isCurrentOrFutureProgram(program)) missing.push("event_not_current_or_future");
  if (!filled(program.levelRequired)) missing.push("level");
  if (!filled(program.riskLevel)) missing.push("risk");
  if (program.medicalLimitations === undefined || program.medicalLimitations === null) missing.push("medical");
  const notes = readStoredEnrichment(program.aiEnrichment)?.notes;
  if (!organizerFilled(program.cancellationRules) && !filled(notes?.cancellation)) missing.push("cancellation");
  const hasLink = filled(program.sourceUrl) || filled(program.cta);
  const hasDetailBlock =
    organizerFilled(program.audienceFit) || organizerFilled(program.itineraryDayByDay) || organizerFilled(program.inclusions);
  if (!hasLink && !hasDetailBlock && !(program.media?.length)) {
    missing.push("source_url_or_content_or_media");
  }
  if (hasSyntheticSignals(program)) missing.push("synthetic_markers_detected");
  // Without an operator, a stub is only acceptable where a MyWave note replaces it on the storefront.
  const covered = new Set<string>();
  if (filled(notes?.gear)) covered.add("gearRequirements");
  if (filled(notes?.cancellation)) covered.add("cancellationRules");
  if (hasPlaceholderOrScrapedMarkup(program, covered)) missing.push("placeholder_or_scraped_markup_detected");
  return { ok: missing.length === 0, missing };
}
