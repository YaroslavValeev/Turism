/**
 * OSINT-дополнения карточки тура (проживание / трансфер / экипировка): валидация и выбор публичных данных.
 * Правила: данные собираются под конкретный тур и его локацию; только черновик → approve владельцем;
 * на витрине — отдельным блоком ПОСЛЕ данных организатора; рейтинг отеля — только из источника-агрегатора
 * с датой проверки; тексты — пересказ со ссылками на источники.
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

export const HOTEL_GROUPS = ["top", "nearby"] as const;
export type HotelGroup = (typeof HOTEL_GROUPS)[number];

export const ENRICHMENT_LIMITS = {
  maxHotels: 10,
  maxHotelsPerGroup: 5,
  nearbyMaxKm: 5,
  maxSources: 20,
  textMin: 50,
  textMax: 1500,
  summaryMax: 1000,
  hotelNameMax: 200,
  distanceNoteMax: 200,
  locationLabelMax: 200,
  sourceTitleMax: 300,
} as const;

export type EnrichmentHotel = {
  name: string;
  group: HotelGroup;
  siteUrl?: string;
  aggregator?: {
    name: AggregatorName;
    url: string;
    rating?: number;
    ratingScale?: number;
    reviewsCount?: number;
  };
  distanceKm?: number;
  distanceNote?: string;
};

export type LocationPoint = { label: string; lat?: number; lng?: number };
export type AccommodationContent = { summary?: string; locationPoint: LocationPoint; hotels: EnrichmentHotel[] };
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

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
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

/** Ключ для поиска дублей: регистр, кавычки, пунктуация и лишние пробелы не важны. */
export function normalizeHotelName(name: string): string {
  return name
    .toLocaleLowerCase("ru")
    .replace(/ё/g, "е")
    .replace(/[«»"'`„“”]/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

/** Ключ URL для поиска дублей: без схемы, www, query/hash и завершающего слэша. */
export function normalizeUrlKey(url: string): string {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.toLowerCase().replace(/^www\./, "");
    return `${host}${parsed.pathname.replace(/\/+$/, "").toLowerCase()}`;
  } catch {
    return url.trim().toLowerCase();
  }
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

  const group = raw.group;
  if (group !== "top" && group !== "nearby") {
    errors.push(`${at}.group: допустимы top | nearby`);
    return null;
  }

  const hotel: EnrichmentHotel = { name: name ?? "", group };

  if (raw.siteUrl !== undefined && raw.siteUrl !== null && raw.siteUrl !== "") {
    if (!isPublicHttpUrl(raw.siteUrl)) errors.push(`${at}.siteUrl: нужен публичный http(s) URL`);
    else hotel.siteUrl = String(raw.siteUrl).trim();
  }

  const distanceNote = optionalTrimmed(raw.distanceNote);
  if (distanceNote) {
    if (distanceNote.length > ENRICHMENT_LIMITS.distanceNoteMax) errors.push(`${at}.distanceNote слишком длинный`);
    hotel.distanceNote = distanceNote;
  }

  if (raw.distanceKm !== undefined && raw.distanceKm !== null) {
    if (!isFiniteNumber(raw.distanceKm) || raw.distanceKm <= 0) errors.push(`${at}.distanceKm: число > 0`);
    else hotel.distanceKm = raw.distanceKm;
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
          const scale = agg.ratingScale;
          if (!isFiniteNumber(scale) || scale <= 0) {
            errors.push(`${at}.aggregator.ratingScale обязателен и > 0, если указан rating`);
          } else if (!isFiniteNumber(agg.rating) || agg.rating < 0 || agg.rating > scale) {
            errors.push(`${at}.aggregator.rating должен быть в диапазоне 0..${scale}`);
          } else {
            aggregator.rating = agg.rating;
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

  if (group === "top" && (hotel.aggregator?.rating === undefined || hotel.aggregator.ratingScale === undefined)) {
    errors.push(`${at}: в группе top нужен aggregator с rating и ratingScale (топ — по публичным оценкам)`);
  }
  if (group === "nearby" && (hotel.distanceKm === undefined || hotel.distanceKm > ENRICHMENT_LIMITS.nearbyMaxKm)) {
    errors.push(`${at}: в группе nearby нужен distanceKm в диапазоне (0; ${ENRICHMENT_LIMITS.nearbyMaxKm}] км`);
  }
  return hotel;
}

function validateLocationPoint(raw: unknown, errors: string[]): LocationPoint | null {
  if (!isRecord(raw)) {
    errors.push("content.locationPoint обязателен: { label, lat?, lng? }");
    return null;
  }
  const label = optionalTrimmed(raw.label);
  if (!label) {
    errors.push("content.locationPoint.label обязателен");
    return null;
  }
  if (label.length > ENRICHMENT_LIMITS.locationLabelMax) errors.push("content.locationPoint.label слишком длинный");
  const point: LocationPoint = { label };
  const hasLat = raw.lat !== undefined && raw.lat !== null;
  const hasLng = raw.lng !== undefined && raw.lng !== null;
  if (hasLat !== hasLng) errors.push("content.locationPoint: lat и lng указываются вместе");
  if (hasLat) {
    if (!isFiniteNumber(raw.lat) || raw.lat < -90 || raw.lat > 90) errors.push("content.locationPoint.lat: -90..90");
    else point.lat = raw.lat;
  }
  if (hasLng) {
    if (!isFiniteNumber(raw.lng) || raw.lng < -180 || raw.lng > 180) errors.push("content.locationPoint.lng: -180..180");
    else point.lng = raw.lng;
  }
  return point;
}

function checkHotelUniqueness(hotels: EnrichmentHotel[], errors: string[]): void {
  const names = new Map<string, number>();
  const urls = new Map<string, number>();
  hotels.forEach((hotel, index) => {
    const nameKey = normalizeHotelName(hotel.name);
    if (nameKey) {
      const prev = names.get(nameKey);
      if (prev !== undefined) errors.push(`hotels[${index}]: дубль отеля hotels[${prev}] по названию`);
      else names.set(nameKey, index);
    }
    for (const url of [hotel.siteUrl, hotel.aggregator?.url]) {
      if (!url) continue;
      const key = normalizeUrlKey(url);
      const prev = urls.get(key);
      if (prev !== undefined && prev !== index) errors.push(`hotels[${index}]: дубль отеля hotels[${prev}] по ссылке ${url}`);
      else urls.set(key, index);
    }
  });
}

function validateContent(field: EnrichmentField, content: unknown, errors: string[]): EnrichmentContent | null {
  if (!isRecord(content)) {
    errors.push("content: должен быть объектом");
    return null;
  }
  if (field === "accommodation") {
    const locationPoint = validateLocationPoint(content.locationPoint, errors);
    const result: AccommodationContent = { locationPoint: locationPoint ?? { label: "" }, hotels: [] };
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
    for (const group of HOTEL_GROUPS) {
      if (result.hotels.filter((h) => h.group === group).length > ENRICHMENT_LIMITS.maxHotelsPerGroup) {
        errors.push(`content.hotels: в группе ${group} не больше ${ENRICHMENT_LIMITS.maxHotelsPerGroup}`);
      }
    }
    checkHotelUniqueness(result.hotels, errors);
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

export type EnrichmentRowLike = {
  field: string;
  status: string;
  contentJson: unknown;
  sourcesJson: unknown;
  checkedAt: Date | string;
};

export type PublicEnrichmentEntry = EnrichmentContent & { sources: EnrichmentSource[]; checkedAt: string };
export type PublicEnrichment = Partial<Record<EnrichmentField, PublicEnrichmentEntry>>;

/**
 * Все одобренные поля (по одному на поле; строки ожидаются отсортированными от свежих к старым).
 * Показ идёт отдельным блоком под данными организатора, поэтому заполненность полей организатора здесь не важна.
 * Невалидные строки молча отбрасываются.
 */
export function pickPublicEnrichment(rows: EnrichmentRowLike[]): PublicEnrichment {
  const result: PublicEnrichment = {};
  for (const row of rows) {
    if (row.status !== "approved" || !isEnrichmentField(row.field)) continue;
    if (result[row.field]) continue;
    const checked = new Date(row.checkedAt);
    if (Number.isNaN(checked.getTime())) continue;
    const valid = validateEnrichmentInput(row.field, row.contentJson, row.sourcesJson);
    if (!valid.ok) continue;
    result[row.field] = { ...valid.content, sources: valid.sources, checkedAt: checked.toISOString() };
  }
  return result;
}
