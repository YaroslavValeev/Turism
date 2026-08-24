import type { Env } from "@mywave/config";
import type { Organizer, Program, ProgramMedia, Source } from "@prisma/client";

export type CampSport = "wakesurf" | "wakeboard";
export type CampAvailabilityStatus = "available" | "few_spots" | "sold_out" | "waitlist" | "unknown";
export type CampPublicationStatus = "published" | "hidden" | "archived" | "cancelled";
export type CampContentRightsStatus = "partner_allowed" | "unknown" | "restricted";

export type CampProgramRow = Program & {
  media: ProgramMedia[];
  organizer: Pick<Organizer, "id" | "displayName" | "verificationStatus">;
  source: Pick<Source, "id" | "name" | "urlOrHandle" | "country" | "region" | "language"> | null;
};

export interface CampContract {
  id: string;
  title: string;
  sport: CampSport[];
  level: string[];
  country: string;
  region: string | null;
  city: string | null;
  location_name: string | null;
  address: string | null;
  lat: number | null;
  lng: number | null;
  start_date: string;
  end_date: string;
  duration_days: number;
  price_from: number | null;
  price_to: number | null;
  currency: string | null;
  price_note: string | null;
  included: string[];
  not_included: string[];
  organizer_name: string;
  organizer_type: "external";
  short_description: string | null;
  description: string | null;
  cover_image_url: string | null;
  gallery: string[];
  video_url: string | null;
  booking_url: string | null;
  availability_status: CampAvailabilityStatus;
  publication_status: CampPublicationStatus;
  audience_language: string[];
  content_rights_status: CampContentRightsStatus;
  source_url: string | null;
  updated_at: string;
}

const SUPPORTED_PUBLICATION_STATUSES = new Set(["published", "paused", "archived", "draft", "internal_review", "needs_fix", "approved"]);

function normalizeText(value: string | null | undefined): string {
  return String(value ?? "").trim();
}

function includesAny(value: string, terms: string[]): boolean {
  const normalized = value.toLowerCase();
  return terms.some((term) => normalized.includes(term));
}

export function resolveCampId(programId: string): string {
  return `tour_${programId}`;
}

export function resolveProgramIdFromCampId(campId: string): string {
  return campId.startsWith("tour_") ? campId.slice("tour_".length) : campId;
}

export function normalizeSports(row: Pick<Program, "discipline" | "title" | "formatType" | "audienceFit">): CampSport[] {
  const haystack = [row.discipline, row.title, row.formatType, row.audienceFit].map(normalizeText).join(" ");
  const result: CampSport[] = [];
  if (includesAny(haystack, ["wakesurf", "wake surf", "вейксерф", "вейк-серф", "вейк серф"])) {
    result.push("wakesurf");
  }
  if (includesAny(haystack, ["wakeboard", "wake board", "вейкборд", "вейк-борд", "вейк борд"])) {
    result.push("wakeboard");
  }
  return result;
}

export function normalizePublicationStatus(publishStatus: string): CampPublicationStatus | null {
  if (!SUPPORTED_PUBLICATION_STATUSES.has(publishStatus)) return null;
  if (publishStatus === "published") return "published";
  if (publishStatus === "archived") return "archived";
  return "hidden";
}

export function normalizeAvailabilityStatus(row: Pick<Program, "spotsAvailable" | "capacityTotal" | "publishStatus">): CampAvailabilityStatus {
  if (row.publishStatus === "archived") return "unknown";
  if (row.spotsAvailable === 0) return "sold_out";
  if (row.spotsAvailable == null) return "unknown";
  if (row.capacityTotal != null && row.capacityTotal > 0) {
    const fewSpotThreshold = Math.max(1, Math.ceil(row.capacityTotal * 0.2));
    return row.spotsAvailable <= fewSpotThreshold ? "few_spots" : "available";
  }
  return row.spotsAvailable <= 3 ? "few_spots" : "available";
}

function splitList(value: string | null | undefined): string[] {
  return normalizeText(value)
    .split(/\r?\n|;|•|\u2022/g)
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 20);
}

function normalizeLevels(value: string | null | undefined): string[] {
  const raw = normalizeText(value);
  if (!raw) return [];
  const tokens = raw
    .split(/\s*[,+;/|]\s*|\r?\n/g)
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
  const mapped = tokens.map((token) => {
    if (["newbie", "novice", "начинающий", "новичок", "старт"].includes(token)) return "beginner";
    if (["средний", "продолжающий"].includes(token)) return "intermediate";
    if (["продвинутый"].includes(token)) return "advanced";
    return token;
  });
  return Array.from(new Set(mapped)).slice(0, 8);
}

function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function isoDateTime(date: Date): string {
  return date.toISOString();
}

function durationDays(startDate: Date, endDate: Date, existing: number): number {
  if (Number.isInteger(existing) && existing > 0) return existing;
  const diff = Math.round((endDate.getTime() - startDate.getTime()) / 86_400_000) + 1;
  return Math.max(1, diff);
}

function firstHttpUrl(...values: Array<string | null | undefined>): string | null {
  for (const value of values) {
    const trimmed = normalizeText(value);
    if (/^https?:\/\//i.test(trimmed)) return trimmed;
  }
  return null;
}

function absoluteUrl(value: string | null | undefined, env: Env): string | null {
  const trimmed = normalizeText(value);
  if (!trimmed) return null;
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  if (trimmed.startsWith("/")) {
    return `${env.PUBLIC_WEB_BASE_URL.replace(/\/+$/, "")}${trimmed}`;
  }
  return trimmed;
}

function buildProgramUrl(programId: string, env: Env): string {
  return `${env.PUBLIC_WEB_BASE_URL.replace(/\/+$/, "")}/program/${programId}`;
}

function firstSentence(value: string | null | undefined): string | null {
  const text = normalizeText(value).replace(/\s+/g, " ");
  if (!text) return null;
  if (text.length <= 240) return text;
  return `${text.slice(0, 237).trimEnd()}...`;
}

function buildDescription(row: CampProgramRow): string | null {
  const parts = [
    normalizeText(row.itineraryDayByDay),
    normalizeText(row.audienceFit),
    normalizeText(row.inclusions),
    normalizeText(row.exclusions),
    normalizeText(row.gearRequirements),
    normalizeText(row.cancellationRules),
  ].filter(Boolean);
  return parts.length > 0 ? parts.join("\n\n") : null;
}

function resolveCountry(row: CampProgramRow): string {
  return normalizeText(row.source?.country) || normalizeText(row.region);
}

function resolveRegion(row: CampProgramRow): string | null {
  return normalizeText(row.source?.region) || normalizeText(row.region) || null;
}

function resolveContentRightsStatus(row: CampProgramRow): CampContentRightsStatus {
  if (row.reviewStatus === "flagged") return "restricted";
  // Intake provenance is not a legal rights grant. `partner_allowed` must only
  // be emitted after an explicit, persisted rights confirmation is introduced.
  return "unknown";
}

export function mapProgramToCamp(row: CampProgramRow, env: Env): CampContract | null {
  const sport = normalizeSports(row);
  if (sport.length === 0) return null;

  const publicationStatus = normalizePublicationStatus(row.publishStatus);
  if (!publicationStatus) return null;

  const country = resolveCountry(row);
  const organizerName = normalizeText(row.organizerName) || normalizeText(row.organizer.displayName);
  if (!row.title || !country || !row.startDate || !row.endDate || !organizerName) return null;

  const images = row.media
    .filter((media) => media.mediaType === "image")
    .map((media) => absoluteUrl(media.url, env))
    .filter((url): url is string => Boolean(url));
  const videoUrl = row.media.find((media) => media.mediaType === "video")?.url ?? null;
  const sourceUrl = firstHttpUrl(row.sourceUrl, row.source?.urlOrHandle);
  const programUrl = buildProgramUrl(row.id, env);
  const updatedAt = row.updatedFromSourceAt ?? row.updatedAt;

  return {
    id: resolveCampId(row.id),
    title: row.title,
    sport,
    level: normalizeLevels(row.levelRequired),
    country,
    region: resolveRegion(row),
    city: null,
    location_name: normalizeText(row.exactLocation) || null,
    address: null,
    lat: null,
    lng: null,
    start_date: isoDate(row.startDate),
    end_date: isoDate(row.endDate),
    duration_days: durationDays(row.startDate, row.endDate, row.durationDays),
    price_from: row.priceFromRub ?? null,
    price_to: null,
    currency: normalizeText(row.currency) || null,
    price_note: null,
    included: splitList(row.inclusions),
    not_included: splitList(row.exclusions),
    organizer_name: organizerName,
    organizer_type: "external",
    short_description: firstSentence(row.audienceFit ?? row.itineraryDayByDay ?? row.inclusions),
    description: buildDescription(row),
    cover_image_url: images[0] ?? null,
    gallery: images,
    video_url: absoluteUrl(videoUrl, env),
    booking_url: firstHttpUrl(row.sourceUrl) ?? programUrl,
    availability_status: normalizeAvailabilityStatus(row),
    publication_status: publicationStatus,
    audience_language: ["ru"],
    content_rights_status: resolveContentRightsStatus(row),
    source_url: sourceUrl,
    updated_at: isoDateTime(updatedAt),
  };
}
