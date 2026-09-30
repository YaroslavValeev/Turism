/** Поля карточки, которые заполняют сбор из источников и ИИ-автозаполнение. */
export const PROGRAM_CONTENT_FIELDS = [
  "title", "discipline", "region", "exactLocation", "startDate", "endDate", "durationDays",
  "formatType", "audienceFit", "levelRequired", "riskLevel", "priceFromRub", "currency",
  "inclusions", "exclusions", "gearRequirements", "medicalLimitations", "itineraryDayByDay",
  "organizerName", "cancellationRules", "whatHappensAfterBooking", "cta",
] as const;

export type ProgramContentField = (typeof PROGRAM_CONTENT_FIELDS)[number];

const CONTENT_FIELD_SET = new Set<string>(PROGRAM_CONTENT_FIELDS);

export function isProgramContentField(value: string): value is ProgramContentField {
  return CONTENT_FIELD_SET.has(value);
}

function comparable(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return value.toISOString();
  return String(value).trim();
}

/** Поля, значение которых админ действительно изменил (форма может присылать неизменённые поля). */
export function changedContentFields(existing: Record<string, unknown>, data: Record<string, unknown>): string[] {
  return Object.keys(data).filter((field) => isProgramContentField(field) && comparable(existing[field]) !== comparable(data[field]));
}

export function nextManualFields(current: readonly string[], added: readonly string[], released: readonly string[] = []): string[] {
  const releasedSet = new Set(released);
  return [...new Set([...current, ...added])].filter((f) => !releasedSet.has(f)).sort();
}

/** Поля, которые повторный сбор не трогает: правки админа и уже осмысленно заполненные ИИ. */
export function lockedProgramFields(program: { manualFields?: readonly string[] | null; aiEnrichment?: unknown }): string[] {
  const ai = program.aiEnrichment;
  const aiFields =
    ai && typeof ai === "object" && Array.isArray((ai as { fields?: unknown }).fields)
      ? ((ai as { fields: unknown[] }).fields.filter((f): f is string => typeof f === "string"))
      : [];
  return [...new Set([...(program.manualFields ?? []), ...aiFields])];
}

/** Убирает из обновления поля, закреплённые админом. */
export function withoutManualFields<T extends Record<string, unknown>>(data: T, manualFields: readonly string[] | null | undefined): T {
  if (!manualFields || manualFields.length === 0) return data;
  const locked = new Set(manualFields);
  return Object.fromEntries(Object.entries(data).filter(([key]) => !locked.has(key))) as T;
}
