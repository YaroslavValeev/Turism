/**
 * OSINT-дополнения карточки тура (проживание / трансфер / экипировка): валидация и выбор публичных данных.
 * Правила: только черновик → approve владельцем; данные организатора всегда важнее; рейтинг отеля — только из
 * источника-агрегатора с датой проверки; тексты — пересказ со ссылками на источники.
 */
import { isPublicHttpUrl } from "../scout/validate";

export const ENRICHMENT_FIELDS = ["accommodation", "transfer", "equipment"] as const;
export type EnrichmentField = (typeof ENRICHMENT_FIELDS)[number];

export const ENRICHMENT_STATUSES = ["draft", "approved", "rejected", "retired"] as const;
export type EnrichmentStatus = (typeof ENRICHMENT_STATUSES)[number];

export const AGGREGATORS = {
  yandex_travel: { host: "travel.yandex.ru" },
  ostrovok: { host: "ostrovok.ru" },
} as const;
export type AggregatorName = keyof typeof AGGREGATORS;

export const ENRICHMENT_LIMITS = {
  maxHotels: 10,
  maxSources: 20,
  textMin: 50,
  textMax: 1500,
  summaryMax: 1000,
  hotelNameMax: 200,
  distanceNoteMax: 200,
  sourceTitleMax: 300,
} as const;

export type EnrichmentHotel = {
  name: string;
  siteUrl?: string;
  aggregator?: {
    name: AggregatorName;
    url: string;
    rating?: number;
    ratingScale?: number;
    reviewsCount?: number;
  };
  distanceNote?: string;
};

export type AccommodationContent = { summary?: string; hotels: EnrichmentHotel[] };
export type TextContent = { text: string };
export type EnrichmentContent = AccommodationContent | TextContent;
export type EnrichmentSource = { url: string; title?: string; accessedAt: string };

export type EnrichmentValidationResult =
  | { ok: true; field: EnrichmentField; content: EnrichmentContent; sources: EnrichmentSource[] }
  | { ok: false; errors: string[] };

export function isEnrichmentField(value: unknown): value is EnrichmentField {
  return typeof value === "string" && (ENRICHMENT_FIELDS as readonly string[]).includes(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function optionalTrimmed(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function hostMatches(url: string, expectedHost: string): boolean {
  try {
    const host = new URL(url).hostname.toLowerCase().replace(/\.$/, "");
    return host === expectedHost || host.endsWith(`.${expectedHost}`);
  } catch {
    return false;
  }
}

function isValidDateString(value: unknown): value is string {
  return typeof value === "string" && value.trim() !== "" && !Number.isNaN(Date.parse(value));
}

function validateHotel(raw: unknown, index: number, errors: string[]): EnrichmentHotel | null {
  const at = `hotels[${index}]`;
  if (!isRecord(raw)) {
    errors.push(`${at}: должен быть объектом`);
    return null;
  }
  const name = optionalTrimmed(raw.name);
  if (!name) errors.push(`${at}.name обязателен`);
  else if (name.length > ENRICHMENT_LIMITS.hotelNameMax) errors.push(`${at}.name длиннее ${ENRICHMENT_LIMITS.hotelNameMax} символов`);

  const hotel: EnrichmentHotel = { name: name ?? "" };

  if (raw.siteUrl !== undefined && raw.siteUrl !== null && raw.siteUrl !== "") {
    if (!isPublicHttpUrl(raw.siteUrl)) errors.push(`${at}.siteUrl: нужен публичный http(s) URL`);
    else hotel.siteUrl = String(raw.siteUrl).trim();
  }

  const distanceNote = optionalTrimmed(raw.distanceNote);
  if (distanceNote) {
    if (distanceNote.length > ENRICHMENT_LIMITS.distanceNoteMax) errors.push(`${at}.distanceNote слишком длинный`);
    hotel.distanceNote = distanceNote;
  }

  if (raw.aggregator !== undefined && raw.aggregator !== null) {
    const agg = raw.aggregator;
    if (!isRecord(agg)) {
      errors.push(`${at}.aggregator: должен быть объектом`);
    } else {
      const aggName = agg.name;
      if (aggName !== "yandex_travel" && aggName !== "ostrovok") {
        errors.push(`${at}.aggregator.name: допустимы yandex_travel | ostrovok`);
      } else if (!isPublicHttpUrl(agg.url)) {
        errors.push(`${at}.aggregator.url: нужен публичный http(s) URL`);
      } else if (!hostMatches(String(agg.url), AGGREGATORS[aggName].host)) {
        errors.push(`${at}.aggregator.url: хост не совпадает с ${AGGREGATORS[aggName].host}`);
      } else {
        const aggregator: NonNullable<EnrichmentHotel["aggregator"]> = { name: aggName, url: String(agg.url).trim() };
        if (agg.rating !== undefined && agg.rating !== null) {
          const rating = agg.rating;
          const scale = agg.ratingScale;
          if (typeof scale !== "number" || !Number.isFinite(scale) || scale <= 0) {
            errors.push(`${at}.aggregator.ratingScale обязателен и > 0, если указан rating`);
          } else if (typeof rating !== "number" || !Number.isFinite(rating) || rating < 0 || rating > scale) {
            errors.push(`${at}.aggregator.rating должен быть в диапазоне 0..${scale}`);
          } else {
            aggregator.rating = rating;
            aggregator.ratingScale = scale;
          }
        }
        if (agg.reviewsCount !== undefined && agg.reviewsCount !== null) {
          if (!Number.isInteger(agg.reviewsCount) || Number(agg.reviewsCount) < 0) {
            errors.push(`${at}.aggregator.reviewsCount: целое число ≥ 0`);
          } else {
            aggregator.reviewsCount = Number(agg.reviewsCount);
          }
        }
        hotel.aggregator = aggregator;
      }
    }
  }
  return hotel;
}

function validateContent(field: EnrichmentField, content: unknown, errors: string[]): EnrichmentContent | null {
  if (!isRecord(content)) {
    errors.push("content: должен быть объектом");
    return null;
  }
  if (field === "accommodation") {
    const result: AccommodationContent = { hotels: [] };
    const summary = optionalTrimmed(content.summary);
    if (summary) {
      if (summary.length > ENRICHMENT_LIMITS.summaryMax) errors.push(`content.summary длиннее ${ENRICHMENT_LIMITS.summaryMax} символов`);
      result.summary = summary;
    }
    const hotels = content.hotels ?? [];
    if (!Array.isArray(hotels)) {
      errors.push("content.hotels: должен быть массивом");
      return null;
    }
    if (hotels.length > ENRICHMENT_LIMITS.maxHotels) errors.push(`content.hotels: не больше ${ENRICHMENT_LIMITS.maxHotels}`);
    hotels.forEach((raw, index) => {
      const hotel = validateHotel(raw, index, errors);
      if (hotel) result.hotels.push(hotel);
    });
    if (!result.summary && result.hotels.length === 0) errors.push("content: нужен summary или хотя бы один отель");
    return result;
  }
  const text = optionalTrimmed(content.text) ?? "";
  if (text.length < ENRICHMENT_LIMITS.textMin || text.length > ENRICHMENT_LIMITS.textMax) {
    errors.push(`content.text: длина ${ENRICHMENT_LIMITS.textMin}..${ENRICHMENT_LIMITS.textMax} символов (сейчас ${text.length})`);
  }
  return { text };
}

function validateSources(sources: unknown, errors: string[]): EnrichmentSource[] {
  if (!Array.isArray(sources) || sources.length === 0) {
    errors.push("sources: нужен хотя бы один источник");
    return [];
  }
  if (sources.length > ENRICHMENT_LIMITS.maxSources) errors.push(`sources: не больше ${ENRICHMENT_LIMITS.maxSources}`);
  const out: EnrichmentSource[] = [];
  sources.forEach((raw, index) => {
    const at = `sources[${index}]`;
    if (!isRecord(raw)) {
      errors.push(`${at}: должен быть объектом`);
      return;
    }
    if (!isPublicHttpUrl(raw.url)) {
      errors.push(`${at}.url: нужен публичный http(s) URL`);
      return;
    }
    if (!isValidDateString(raw.accessedAt)) {
      errors.push(`${at}.accessedAt: нужна дата (ISO)`);
      return;
    }
    const source: EnrichmentSource = { url: String(raw.url).trim(), accessedAt: String(raw.accessedAt).trim() };
    const title = optionalTrimmed(raw.title);
    if (title) source.title = title.slice(0, ENRICHMENT_LIMITS.sourceTitleMax);
    out.push(source);
  });
  return out;
}

export function validateEnrichmentInput(field: unknown, content: unknown, sources: unknown): EnrichmentValidationResult {
  if (!isEnrichmentField(field)) {
    return { ok: false, errors: [`field: допустимы ${ENRICHMENT_FIELDS.join(" | ")}`] };
  }
  const errors: string[] = [];
  const normalizedContent = validateContent(field, content, errors);
  const normalizedSources = validateSources(sources, errors);
  if (errors.length > 0 || !normalizedContent) return { ok: false, errors };
  return { ok: true, field, content: normalizedContent, sources: normalizedSources };
}

/** Служебные заглушки сбора из источников (синхронно с apps/web recommendedProgramFields). */
const PLACEHOLDER_PATTERNS = [
  /^требует\s+ручно(?:го\s+заполнения|й\s+нормализации)/i,
  /^базовая программа и сопровождение организатора\.\s*детальный состав/i,
];

function organizerValuePresent(value: string | null | undefined): boolean {
  const text = String(value ?? "").trim();
  return text !== "" && !PLACEHOLDER_PATTERNS.some((p) => p.test(text));
}

const LABELED_PATTERNS: Record<Exclude<EnrichmentField, "equipment">, RegExp> = {
  accommodation: /^(?:тип\s+размещ(?:ения|ение)|размещ(?:ение|ения)|проживание)\s*[:\-]\s*(.+)$/i,
  transfer: /^(?:трансфер|дорога|логистика|переезды)\s*[:\-]\s*(.+)$/i,
};

function extractLabeled(field: Exclude<EnrichmentField, "equipment">, texts: Array<string | null | undefined>): string | null {
  for (const line of texts.map((t) => String(t ?? "")).join("\n").split(/\r?\n/)) {
    const match = line.trim().match(LABELED_PATTERNS[field]);
    if (match?.[1]?.trim()) return match[1].trim();
  }
  return null;
}

export type ProgramOrganizerFields = Partial<Record<EnrichmentField, string | null>>;

/** Значения организатора для трёх полей: экипировка — gearRequirements, остальное — строки «Проживание: …» в текстах карточки. */
export function organizerFieldsFromProgram(p: {
  gearRequirements?: string | null;
  inclusions?: string | null;
  exclusions?: string | null;
  itineraryDayByDay?: string | null;
  audienceFit?: string | null;
  trustReason?: string | null;
}): ProgramOrganizerFields {
  const scope = [p.inclusions, p.exclusions, p.itineraryDayByDay, p.audienceFit, p.trustReason];
  return {
    accommodation: extractLabeled("accommodation", scope),
    transfer: extractLabeled("transfer", scope),
    equipment: p.gearRequirements ?? null,
  };
}

export type EnrichmentRowLike = {
  field: string;
  status: string;
  contentJson: unknown;
  sourcesJson: unknown;
  checkedAt: Date | string;
};

export type PublicEnrichmentEntry = EnrichmentContent & { sources: EnrichmentSource[]; checkedAt: string };
export type PublicEnrichment = Partial<Record<EnrichmentField, PublicEnrichmentEntry>>;

/** Только approved и только там, где организатор поле не заполнил; невалидные строки молча отбрасываются. */
export function pickPublicEnrichment(programFields: ProgramOrganizerFields, rows: EnrichmentRowLike[]): PublicEnrichment {
  const result: PublicEnrichment = {};
  for (const row of rows) {
    if (row.status !== "approved" || !isEnrichmentField(row.field)) continue;
    if (organizerValuePresent(programFields[row.field])) continue;
    if (result[row.field]) continue;
    const checked = new Date(row.checkedAt);
    if (Number.isNaN(checked.getTime())) continue;
    const valid = validateEnrichmentInput(row.field, row.contentJson, row.sourcesJson);
    if (!valid.ok) continue;
    result[row.field] = { ...valid.content, sources: valid.sources, checkedAt: checked.toISOString() };
  }
  return result;
}
