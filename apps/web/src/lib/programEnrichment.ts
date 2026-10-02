/** OSINT-дополнения карточки (approved владельцем) из GET /programs/:id → enrichment. */

export type EnrichmentSource = { url: string; title?: string; accessedAt: string };

export type EnrichmentHotel = {
  name: string;
  siteUrl?: string;
  aggregator?: {
    name: "yandex_travel" | "ostrovok";
    url: string;
    rating?: number;
    ratingScale?: number;
    reviewsCount?: number;
  };
  distanceNote?: string;
};

type EnrichmentMeta = { sources: EnrichmentSource[]; checkedAt: string };
export type AccommodationEnrichment = EnrichmentMeta & { summary?: string; hotels: EnrichmentHotel[] };
export type TextEnrichment = EnrichmentMeta & { text: string };

export type ProgramEnrichment = {
  accommodation?: AccommodationEnrichment;
  transfer?: TextEnrichment;
  equipment?: TextEnrichment;
};

export type FieldEnrichment = AccommodationEnrichment | TextEnrichment;

const AGGREGATOR_LABELS: Record<string, string> = {
  yandex_travel: "Яндекс Путешествия",
  ostrovok: "Островок",
};

/** dd.mm.yyyy по UTC; невалидная дата → "". */
export function formatEnrichmentDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const dd = String(date.getUTCDate()).padStart(2, "0");
  const mm = String(date.getUTCMonth() + 1).padStart(2, "0");
  return `${dd}.${mm}.${date.getUTCFullYear()}`;
}

export function enrichmentCaption(checkedAt: string): string {
  const date = formatEnrichmentDate(checkedAt);
  return date ? `По открытым источникам · проверено MyWave ${date}` : "По открытым источникам · проверено MyWave";
}

function formatRating(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1).replace(".", ",");
}

/** «Яндекс Путешествия · 4,7/5» — рейтинг только если есть и он, и шкала из источника. */
export function aggregatorLinkLabel(aggregator: NonNullable<EnrichmentHotel["aggregator"]>): string {
  const name = AGGREGATOR_LABELS[aggregator.name] ?? aggregator.name;
  if (typeof aggregator.rating === "number" && typeof aggregator.ratingScale === "number" && aggregator.ratingScale > 0) {
    return `${name} · ${formatRating(aggregator.rating)}/${formatRating(aggregator.ratingScale)}`;
  }
  return name;
}

export function sourceLinkLabel(source: EnrichmentSource): string {
  if (source.title?.trim()) return source.title.trim();
  try {
    return new URL(source.url).hostname.replace(/^www\./i, "");
  } catch {
    return source.url;
  }
}

export function isSafeHttpUrl(value: unknown): value is string {
  if (typeof value !== "string") return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

export function isAccommodationEnrichment(value: FieldEnrichment): value is AccommodationEnrichment {
  return Array.isArray((value as AccommodationEnrichment).hotels);
}
