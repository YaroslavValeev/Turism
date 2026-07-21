import crypto from "crypto";
import fs from "fs";
import path from "path";
import { spawnSync } from "child_process";
import {
  DEFAULT_INGESTION_DAILY_SOURCE_LIMIT,
  MAX_INGESTION_DAILY_SOURCE_LIMIT,
} from "@mywave/config";
import { Prisma, Source, EventCandidate, NormalizedItem, RawItem } from "@prisma/client";
import { prisma } from "../../lib/prisma";
import { writeAuditLog } from "../../lib/audit";
import { canPublishAutopilot, programIncludeForPublishGate } from "../programs/publishGate";
import { buildProgramDedupKey, pickPreferredProgram, type ProgramDedupShape } from "../programs/dedup";
import { cacheExternalProgramMediaForWeb } from "./mediaCache";
import {
  EVENT_CANDIDATE_STATUSES,
  SOURCE_PRIORITY_RANK,
  SOURCE_RUN_STATUSES,
  type EventCandidateStatus,
  type SourceType,
} from "./constants";

function toWellFormedString(s: string): string {
  const asAny = s as string & { toWellFormed?: () => string };
  if (typeof asAny.toWellFormed === "function") return asAny.toWellFormed();
  return s.replace(/[\uD800-\uDFFF]/g, (ch, i, str) => {
    if (ch >= "\uD800" && ch <= "\uDBFF" && str[i + 1] && str[i + 1] >= "\uDC00" && str[i + 1] <= "\uDFFF") {
      return ch;
    }
    if (ch >= "\uDC00" && ch <= "\uDFFF" && str[i - 1] && str[i - 1] >= "\uD800" && str[i - 1] <= "\uDBFF") {
      return ch;
    }
    return "\uFFFD";
  });
}

function wellFormedJsonValue(value: unknown): unknown {
  if (value === null || value === undefined) return value;
  if (typeof value === "string") return toWellFormedString(value);
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (Array.isArray(value)) return value.map((v) => wellFormedJsonValue(v));
  if (value !== null && typeof value === "object") {
    const o: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      o[k] = wellFormedJsonValue(v);
    }
    return o;
  }
  return String(value);
}

/** jsonb: без суррогатов/битых escape (ошибка Postgres "unexpected end of hex escape"). */
function jsonForJsonb(value: Prisma.InputJsonValue): Prisma.InputJsonValue {
  try {
    const s = JSON.stringify(wellFormedJsonValue(value) as object | unknown[], (_k, v) =>
      typeof v === "bigint" ? v.toString() : v,
    );
    return JSON.parse(s) as Prisma.InputJsonValue;
  } catch {
    return { _roundtrip: "failed" } as Prisma.InputJsonValue;
  }
}

function textWellFormed(s: string | null | undefined): string | null {
  if (s == null) return s ?? null;
  return toWellFormedString(s);
}

type SourceWithOrganizer = Source & {
  organizer: { id: string; displayName: string } | null;
};

type RawItemWithSource = RawItem & {
  source: SourceWithOrganizer;
};

type CandidateWithRelations = EventCandidate & {
  publishedProgram?: {
    id: string;
    candidateId: string;
    programId: string;
    publishedAt: Date;
    publishStatus: string;
    editorNotes: string | null;
  } | null;
  normalizedItem: NormalizedItem & {
    rawItem: RawItemWithSource;
  };
};

type PublishedProgramLink = NonNullable<CandidateWithRelations["publishedProgram"]>;

/** Метрики для батч-статистики автопубликации (только при autoPublishEnabled в вызове). */
export type AutopilotPublishMeta = {
  path: "create" | "duplicate_merge";
  programId: string;
  /** Итоговый publishStatus у Program после обработки */
  programPublishStatus: string;
  autoPublishRequested: boolean;
  /** Гейт canPublishAutopilot: пройден (public) / не вызывался / провал */
  gate: "passed" | "skipped_no_request" | "failed" | "not_applicable";
  gateMissing?: string[];
};

type PublishCandidateResult = PublishedProgramLink & {
  duplicateSkipped?: boolean;
  autopilot?: AutopilotPublishMeta;
};

/** Агрегат по autoPublishReadyCandidates (и лог-контракт для мониторинга) */
export type AutopilotBatchStats = {
  checked: number;
  /** Кандидаты в выборке до фильтра по источнику и isAutoPublishEligible */
  sourceOptOut: number;
  notEligible: number;
  autoCreated: number;
  /** Обновления существующей программы по duplicate merge path */
  autoUpdated: number;
  autoCreatedPublished: number;
  autoCreatedGateSkipped: number;
  duplicateMerged: number;
  /** Дубликат: программа в итоге в published (в т.ч. удержанная) */
  duplicatePublishedOrRetained: number;
  /** Дубликат: гейт не прошли, публикация не усилена, но витрина осталась от прошлого */
  duplicateRetainedOnly: number;
  gateSkipped: number;
  /** Исключения при publishCandidateToDraft */
  publishFailed: number;
};

type CollectedItem = {
  externalItemId?: string | null;
  sourceUrl?: string | null;
  authorName?: string | null;
  publishedAt?: Date | null;
  rawTitle?: string | null;
  rawText?: string | null;
  rawMedia?: unknown;
  rawPayload?: unknown;
};

type ExplicitDateRange = {
  startDate: Date;
  endDate: Date;
  label: string;
};

type SourceSpecificDateRange = ExplicitDateRange & {
  soldOut?: boolean;
  locationLabel?: string | null;
};

type ScoreBundle = {
  confidenceScore: number;
  eventLikelihoodScore: number;
  futureEventScore: number;
  completenessScore: number;
  sourceTrustScore: number;
  tourismFitScore: number;
  trustScore: number;
  fitScore: number;
  duplicateScore: number;
  finalScore: number;
  reviewPriority: number;
  routedStatus: EventCandidateStatus;
};

type NormalizedDraft = {
  eventType: string | null;
  discipline: string | null;
  title: string | null;
  descriptionShort: string | null;
  descriptionFull: string | null;
  country: string | null;
  region: string | null;
  city: string | null;
  venue: string | null;
  startDate: Date | null;
  endDate: Date | null;
  durationDays: number | null;
  level: string | null;
  priceFrom: number | null;
  currency: string | null;
  organizerName: string | null;
  bookingUrl: string | null;
  imageUrl: string | null;
  confidenceScore: number;
  parseVersion: string;
  extractedJson: Prisma.InputJsonValue;
  scores: ScoreBundle;
};

type RunSummary = {
  scope: string;
  processed: number;
  created: number;
  updated?: number;
};

type DailySyncOptions = {
  autoPublishEnabled?: boolean;
  fallbackImageUrl?: string | null;
  sourceLimit?: number;
};

const fetchFn = (globalThis as { fetch?: (input: string, init?: Record<string, unknown>) => Promise<unknown> }).fetch;

const EVENT_TYPE_KEYWORDS: Record<string, string[]> = {
  camp: ["camp", "bike camp", "кемп", "кэмп", "лагерь", "велолагерь"],
  clinic: ["clinic", "клиник"],
  trip: ["trip", "тур", "выезд", "сплав"],
  training: ["training", "тренировка", "тренировки"],
  expedition: ["expedition", "экспедиция", "heliski", "heli-ski", "heliboarding", "хелиски"],
};

const DISCIPLINE_KEYWORDS: Record<string, string[]> = {
  wakesurf: ["wakesurf", "вейксерф"],
  sup: ["sup", "сап"],
  mtb: ["mtb", "mountain bike", "маунтинбайк", "велотур", "downhill"],
  ski: ["ski", "лыжи", "горные лыжи"],
  snowboard: ["snowboard", "сноуборд"],
  surf: ["surf", "серф"],
  kite: ["kite", "кайт"],
  wing: ["wing", "винг", "вингфойл"],
};

const LEVEL_KEYWORDS: Record<string, string[]> = {
  beginner: ["beginner", "начинающ", "новичк"],
  intermediate: ["intermediate", "middle", "средн"],
  advanced: ["advanced", "продвинут"],
  expert: ["expert", "эксперт", "pro"],
};

const MONTHS: Record<string, number> = {
  января: 1,
  янв: 1,
  февраля: 2,
  фев: 2,
  марта: 3,
  мар: 3,
  апреля: 4,
  апр: 4,
  мая: 5,
  июня: 6,
  июн: 6,
  июля: 7,
  июл: 7,
  августа: 8,
  авг: 8,
  сентября: 9,
  сент: 9,
  сен: 9,
  октября: 10,
  окт: 10,
  ноября: 11,
  ноя: 11,
  декабря: 12,
  дек: 12,
  january: 1,
  jan: 1,
  february: 2,
  feb: 2,
  march: 3,
  mar: 3,
  april: 4,
  apr: 4,
  may: 5,
  june: 6,
  jun: 6,
  july: 7,
  jul: 7,
  august: 8,
  aug: 8,
  september: 9,
  sep: 9,
  october: 10,
  oct: 10,
  november: 11,
  nov: 11,
  december: 12,
  dec: 12,
};

const LOCATION_SIGNALS: Array<{
  keywords: string[];
  country: string;
  region: string;
  city: string | null;
}> = [
  { keywords: ["краснодар", "krasnodar"], country: "Russia", region: "Krasnodar", city: "Krasnodar" },
  { keywords: ["геленджик", "gelendzhik"], country: "Russia", region: "Краснодарский край", city: "Геленджик" },
  { keywords: ["дубай", "dubai"], country: "UAE", region: "Dubai", city: "Dubai" },
  { keywords: ["бодрум", "bodrum"], country: "Turkey", region: "Bodrum", city: "Bodrum" },
  { keywords: ["фетхие", "fethiye"], country: "Turkey", region: "Muğla", city: "Фетхие" },
  { keywords: ["краснодарский край", "собер", "убинская"], country: "Russia", region: "Краснодарский край", city: "Собер-Баш" },
  { keywords: ["нижний новгород", "новинки"], country: "Russia", region: "Нижний Новгород", city: "Нижний Новгород" },
  { keywords: ["архыз", "карачаево-черкес"], country: "Russia", region: "Карачаево-Черкесия", city: "Архыз" },
  { keywords: ["эльбрус", "приэльбрус", "приэльбрусье"], country: "Russia", region: "Кабардино-Балкария", city: "Приэльбрусье" },
  { keywords: ["алтай", "altai"], country: "Russia", region: "Алтай", city: "Алтай" },
  { keywords: ["камчатк", "kamchatka"], country: "Russia", region: "Камчатка", city: "Камчатка" },
  { keywords: ["инзер", "inz", "большому инзеру"], country: "Russia", region: "Башкортостан", city: "Инзер" },
  { keywords: ["зилим", "толпарово", "таш-асты"], country: "Russia", region: "Башкортостан", city: "Зилим" },
  { keywords: ["мурманск", "тундра"], country: "Russia", region: "Мурманская область", city: "Мурманск" },
  { keywords: ["самара"], country: "Russia", region: "Самара", city: "Самара" },
  { keywords: ["завидово", "zavidovo"], country: "Russia", region: "Тверская область", city: "Завидово" },
  { keywords: ["шри-ланк", "sri lanka"], country: "Sri Lanka", region: "Sri Lanka", city: null },
  { keywords: ["патагон", "patagonia"], country: "Chile", region: "Patagonia", city: null },
  { keywords: ["chile", "чили", "andes", "анд", "altiplanico", "andino"], country: "Chile", region: "Chile", city: null },
  { keywords: ["сочи", "rosa khutor", "роза хутор", "красная поляна"], country: "Russia", region: "Сочи", city: "Сочи" },
];

const WAKESTYLE_LOCATION_OVERRIDES: Record<string, { country: string; region: string; city: string }> = {
  геленджике: { country: "Russia", region: "Краснодарский край", city: "Геленджик" },
  геленджик: { country: "Russia", region: "Краснодарский край", city: "Геленджик" },
  gelendzhik: { country: "Russia", region: "Краснодарский край", city: "Геленджик" },
  фетхие: { country: "Turkey", region: "Muğla", city: "Фетхие" },
  fethiye: { country: "Turkey", region: "Muğla", city: "Фетхие" },
};

const OCR_IMAGE_SCRIPT_PATH = path.resolve(__dirname, "../../../scripts/ocr-image.ps1");

function clampScore(value: number): number {
  return Math.max(0, Math.min(1, Number(value.toFixed(4))));
}

function normalizeText(value: string | null | undefined): string {
  return String(value ?? "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

function makeHash(...parts: Array<string | null | undefined>): string {
  return crypto.createHash("sha256").update(parts.filter(Boolean).join("||")).digest("hex");
}

function toMiddayDate(year: number, month: number, day: number): Date {
  return new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
}

function isValidCalendarDate(year: number, month: number, day: number): boolean {
  if (year < 2020 || year > 2035) return false;
  if (month < 1 || month > 12) return false;
  if (day < 1 || day > 31) return false;
  const date = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

function toDateIfValid(value: string | null | undefined): Date | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function daysFromToday(date: Date | null): number | null {
  if (!date) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const candidate = new Date(date);
  candidate.setHours(0, 0, 0, 0);
  return Math.round((candidate.getTime() - today.getTime()) / (24 * 60 * 60 * 1000));
}

function firstNonEmpty(...values: Array<string | null | undefined>): string | null {
  for (const value of values) {
    const normalized = normalizeText(value);
    if (normalized) return normalized;
  }
  return null;
}

function truncate(value: string | null, maxLength: number): string | null {
  if (!value) return null;
  return value.length <= maxLength ? value : `${value.slice(0, maxLength - 1).trim()}…`;
}

function decodeHtmlEntities(value: string | null | undefined): string {
  if (!value) return "";
  return value
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(parseInt(code, 16)))
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ");
}

function looksLikeGenericRawTitle(rawTitle: string | null, source: SourceWithOrganizer): boolean {
  const title = normalizeText(decodeHtmlEntities(rawTitle));
  if (!title) return true;
  const sourceName = normalizeText(source.name).toLowerCase();
  const lowerTitle = title.toLowerCase();
  if (lowerTitle.includes("instagram photos and videos")) return true;
  if (sourceName && lowerTitle.includes(sourceName)) return true;
  if (/^marco gaiani/i.test(title)) return true;
  if (/^(instagram|узнать подробнее|купить билет)$/i.test(title)) return true;
  return false;
}

function deriveTitleFromText(rawText: string | null): string | null {
  const text = normalizeText(decodeHtmlEntities(rawText));
  if (!text) return null;
  const cleaned = text.replace(/^[^\p{L}\p{N}]+/u, "").trim();
  if (!cleaned) return null;
  const firstSentence =
    /(.{8,140}?(?:[.!?](?:\s|$)|\s[•·]\s|$))/u.exec(cleaned)?.[1] ??
    cleaned.split(/\s{2,}|\n/)[0] ??
    cleaned;
  return truncate(firstSentence.trim(), 140);
}

function getMetaObject(meta: Prisma.JsonValue | null | undefined): Record<string, unknown> {
  if (meta && typeof meta === "object" && !Array.isArray(meta)) {
    return meta as Record<string, unknown>;
  }
  return {};
}

function getSourceStringMeta(source: Source, key: string): string | null {
  const value = getMetaObject(source.metaJson)[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function getSourceBooleanMeta(source: Source, key: string): boolean {
  const value = getMetaObject(source.metaJson)[key];
  return value === true || value === "true" || value === "1";
}

/** Глобальный autopublish: все активные источники по умолчанию; opt-out: `metaJson.autoPublish: false`. */
export function shouldRunAutoPublishForSource(source: Source, globalEnabled: boolean): boolean {
  if (!globalEnabled) return false;
  if (getMetaObject(source.metaJson).autoPublish === false) return false;
  return true;
}

function getSourceStringArrayMeta(source: Source, key: string): string[] {
  const value = getMetaObject(source.metaJson)[key];
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string" && item.trim().length > 0).map((item) => item.trim());
}

function getPrimarySourceDiscipline(source: SourceWithOrganizer): string | null {
  const direct = normalizeText(source.discipline);
  if (direct) return direct;
  const fromMeta = getSourceStringArrayMeta(source, "disciplines")[0];
  return normalizeText(fromMeta);
}

type DueSource = Pick<Source, "id" | "isActive" | "lastCheckedAt" | "fetchIntervalMinutes">;

function isSourceDueForCollection(source: DueSource, now = new Date()): boolean {
  if (!source.isActive) return false;
  if (!source.lastCheckedAt) return true;
  const intervalMinutes = Math.max(source.fetchIntervalMinutes, 15);
  return now.getTime() - source.lastCheckedAt.getTime() >= intervalMinutes * 60 * 1000;
}

export function selectDueSourceIds(
  sources: readonly DueSource[],
  sourceLimit = DEFAULT_INGESTION_DAILY_SOURCE_LIMIT,
  now = new Date(),
): string[] {
  if (!Number.isInteger(sourceLimit) || sourceLimit < 1 || sourceLimit > MAX_INGESTION_DAILY_SOURCE_LIMIT) {
    throw new Error(`Invalid daily source limit: expected an integer from 1 to ${MAX_INGESTION_DAILY_SOURCE_LIMIT}`);
  }
  return sources
    .filter((source) => isSourceDueForCollection(source, now))
    .slice(0, sourceLimit)
    .map((source) => source.id);
}

function extractUrls(text: string): string[] {
  return [...text.matchAll(/https?:\/\/[^\s"'<>)\]]+/gi)].map((match) => match[0]);
}

/** Посты-«инфографика/климат» в TG часто кладут картинку-таблицу первой; фото с берега — ниже. */
function isLikelyStatsOrClimateInfographicPostText(text: string): boolean {
  const t = normalizeText(text).toLowerCase();
  if (t.length < 24) return false;
  if (/температур(а|ы)?\s+воды|воды.*температур|средн(яя|ей)\s+температур|таблиц\w*\s+месяц|по\s+месяц\w*.*градус|в\s+течени[еи]\s+года|график\w*.*температур/i.test(t)) {
    return true;
  }
  const hits = [
    /температур/i,
    /таблиц/i,
    /график/i,
    /средн(яя|ей)/i,
    /градус\w*/i,
    /январ\w*.*феврал\w*.*март/i,
  ].filter((p) => p.test(t)).length;
  return hits >= 2;
}

function orderMediaUrlsForCoverPreference(urls: string[], contextText: string): string[] {
  if (urls.length <= 1) return urls;
  if (isLikelyStatsOrClimateInfographicPostText(contextText)) return [...urls].reverse();
  return urls;
}

/** Дисциплина упоминается в теле поста, а не только приписана из метаданных Source. */
function disciplineMentionedInPostText(text: string): boolean {
  const t = text.toLowerCase();
  return Object.values(DISCIPLINE_KEYWORDS).some((keywords) => keywords.some((k) => t.includes(k)));
}

/**
 * Сигнал формата пилотного каталога: выезд/кэмп/тренировка/набор/бронь — см. SITE_IA, taxonomy (camp/trip/…).
 * Не путать с generic travel news.
 */
function hasEventTypeKeywordHit(text: string): boolean {
  return Object.values(EVENT_TYPE_KEYWORDS)
    .flat()
    .some((keyword) => text.includes(keyword));
}

function hasPilotProgramFormatIntent(text: string): boolean {
  if (detectEventType(text)) return true;
  if (hasEventTypeKeywordHit(text)) return true;
  return /(выезд|кэмп|кемп|лагер\w*|тренировк|сбор\s+на|набор\s+на|клиник\w*|интенсив\w*|программ\w*\s+на|мест\w*\s+остал|бронир|участ\w*\s+в|следующ\w+\s+этап|открытие\s+сезона|старт\s+сезона)/i.test(
    text,
  );
}

/** Жёсткий оффтоп для витрины «спортивные выезды / программы» (таблицы климата, статистика без события). */
function buildOffTopicScoutingBundle(partial: {
  eventLikelihoodScore: number;
  futureEventScore: number;
  completenessScore: number;
  sourceTrustScore: number;
}): ScoreBundle {
  return {
    confidenceScore: 0.08,
    eventLikelihoodScore: 0.1,
    futureEventScore: Math.min(0.1, partial.futureEventScore),
    completenessScore: partial.completenessScore,
    sourceTrustScore: partial.sourceTrustScore,
    tourismFitScore: 0.04,
    trustScore: partial.sourceTrustScore,
    fitScore: 0.04,
    duplicateScore: 0,
    finalScore: 0.12,
    reviewPriority: 12,
    routedStatus: "archived",
  };
}

function extractImageUrl(rawMedia: unknown, text: string): string | null {
  const fromArray: string[] = [];
  if (Array.isArray(rawMedia)) {
    for (const item of rawMedia) {
      if (typeof item === "string" && item.trim() && !/\/\/telegram\.org\/img\/emoji\//i.test(item)) {
        fromArray.push(item.trim());
      } else if (item && typeof item === "object") {
        const url = (item as { url?: string }).url;
        if (url?.trim() && !/\/\/telegram\.org\/img\/emoji\//i.test(url)) fromArray.push(url.trim());
      }
    }
  }
  const unique = [...new Set(fromArray)];
  const ranked = orderMediaUrlsForCoverPreference(unique, text);
  if (ranked.length > 0) return ranked[0] ?? null;
  const imageMatches = [...text.matchAll(/https?:\/\/[^\s"']+\.(?:jpg|jpeg|png|webp)/gi)];
  return imageMatches[0]?.[0] ?? null;
}

function normalizeRemoteAssetUrl(value: string | null | undefined): string | null {
  const normalized = normalizeText(value);
  if (!normalized) return null;
  if (normalized.startsWith("//")) return `https:${normalized}`;
  return normalized;
}

function extractOcrTextFromImage(source: SourceWithOrganizer, imageUrl: string | null, rawText: string): string | null {
  if (!imageUrl) return null;
  if (!["telegram", "site", "rss"].includes(source.type)) return null;
  if (!fs.existsSync(OCR_IMAGE_SCRIPT_PATH)) return null;

  const normalizedImageUrl = normalizeRemoteAssetUrl(imageUrl);
  if (!normalizedImageUrl?.startsWith("http")) return null;

  const loweredRawText = normalizeText(decodeHtmlEntities(rawText)).toLowerCase();
  if (hasExplicitDateSignal(loweredRawText) && loweredRawText.length > 80) return null;
  if (/\/\/telegram\.org\/img\/emoji\//i.test(normalizedImageUrl)) return null;

  const result = spawnSync("pwsh", ["-NoLogo", "-NoProfile", "-File", OCR_IMAGE_SCRIPT_PATH, "-ImageUrl", normalizedImageUrl], {
    encoding: "utf8",
    timeout: 15000,
  });
  if (result.error) return null;
  const output = normalizeText(decodeHtmlEntities(result.stdout ?? ""));
  return output.length >= 8 ? output : null;
}

function detectEventType(text: string): string | null {
  for (const [eventType, keywords] of Object.entries(EVENT_TYPE_KEYWORDS)) {
    if (keywords.some((keyword) => text.includes(keyword))) return eventType;
  }
  return null;
}

function detectDiscipline(text: string, source: SourceWithOrganizer): string | null {
  const sourceDiscipline = getPrimarySourceDiscipline(source);
  if (sourceDiscipline) return sourceDiscipline;
  for (const [discipline, keywords] of Object.entries(DISCIPLINE_KEYWORDS)) {
    if (keywords.some((keyword) => text.includes(keyword))) return discipline;
  }
  return null;
}

function detectLevel(text: string): string | null {
  for (const [level, keywords] of Object.entries(LEVEL_KEYWORDS)) {
    if (keywords.some((keyword) => text.includes(keyword))) return level;
  }
  return null;
}

function extractPrice(text: string): { priceFrom: number | null; currency: string | null } {
  const match = text.match(/(?:от|from)?\s*([\d\s]{2,})\s*(₽|руб|rub|eur|usd|\$|€)/i);
  if (!match) return { priceFrom: null, currency: null };
  const rawNumber = match[1].replace(/[^\d]/g, "");
  const priceFrom = rawNumber ? Number(rawNumber) : null;
  const currencyToken = match[2].toLowerCase();
  const currency = currencyToken === "€" || currencyToken === "eur" ? "EUR" : currencyToken === "$" || currencyToken === "usd" ? "USD" : "RUB";
  return { priceFrom, currency };
}

function hasExplicitDateSignal(text: string): boolean {
  return (
    /(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})/.test(text) ||
    /(\d{1,2})(?:\s*(?:-|–|—)\s*(\d{1,2}))?\s+(января|янв|февраля|фев|марта|мар|апреля|апр|мая|июня|июн|июля|июл|августа|авг|сентября|сент|сен|октября|окт|ноября|ноя|декабря|дек|january|jan|february|feb|march|mar|april|apr|may|june|jun|july|jul|august|aug|september|sep|october|oct|november|nov|december|dec)(?:\s+\d{4})?/i.test(
      text,
    ) ||
    /(january|jan|february|feb|march|mar|april|apr|may|june|jun|july|jul|august|aug|september|sep|october|oct|november|nov|december|dec)\s+\d{1,2}(?:\s*(?:-|–|—)\s*\d{1,2})?(?:\s*,?\s*\d{4})?/i.test(
      text,
    )
  );
}

function getExtractedJsonFlag(extractedJson: unknown, key: string): boolean {
  if (!extractedJson || typeof extractedJson !== "object" || Array.isArray(extractedJson)) return false;
  return Boolean((extractedJson as Record<string, unknown>)[key]);
}

function stripHtmlLikeTags(value: string): string {
  return normalizeText(decodeHtmlEntities(value).replace(/<[^>]+>/g, " "));
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function extractDates(text: string, fallbackDate: Date | null): { startDate: Date | null; endDate: Date | null } {
  const dates: Date[] = [];
  const numericPattern = /(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})/g;
  let numericMatch: RegExpExecArray | null;
  while ((numericMatch = numericPattern.exec(text)) !== null) {
    const day = Number(numericMatch[1]);
    const month = Number(numericMatch[2]);
    const year = Number(numericMatch[3].length === 2 ? `20${numericMatch[3]}` : numericMatch[3]);
    if (!isValidCalendarDate(year, month, day)) continue;
    dates.push(toMiddayDate(year, month, day));
  }

  const monthPattern =
    /(\d{1,2})(?:\s*(?:-|–|—)\s*(\d{1,2}))?\s+(января|янв|февраля|фев|марта|мар|апреля|апр|мая|июня|июн|июля|июл|августа|авг|сентября|сент|сен|октября|окт|ноября|ноя|декабря|дек|january|jan|february|feb|march|mar|april|apr|may|june|jun|july|jul|august|aug|september|sep|october|oct|november|nov|december|dec)\s*(\d{4})?/gi;
  let monthMatch: RegExpExecArray | null;
  while ((monthMatch = monthPattern.exec(text)) !== null) {
    const startDay = Number(monthMatch[1]);
    const endDay = monthMatch[2] ? Number(monthMatch[2]) : null;
    const month = MONTHS[monthMatch[3].toLowerCase()];
    const year = monthMatch[4] ? Number(monthMatch[4]) : new Date().getUTCFullYear();
    if (!isValidCalendarDate(year, month, startDay)) continue;
    dates.push(toMiddayDate(year, month, startDay));
    if (endDay != null && isValidCalendarDate(year, month, endDay)) dates.push(toMiddayDate(year, month, endDay));
  }

  const monthFirstPattern =
    /(january|jan|february|feb|march|mar|april|apr|may|june|jun|july|jul|august|aug|september|sep|october|oct|november|nov|december|dec)\s+(\d{1,2})(?:\s*(?:-|–|—)\s*(\d{1,2}))?(?:\s*,?\s*(\d{4}))?/gi;
  let monthFirstMatch: RegExpExecArray | null;
  while ((monthFirstMatch = monthFirstPattern.exec(text)) !== null) {
    const month = MONTHS[monthFirstMatch[1].toLowerCase()];
    const startDay = Number(monthFirstMatch[2]);
    const endDay = monthFirstMatch[3] ? Number(monthFirstMatch[3]) : null;
    const year = monthFirstMatch[4] ? Number(monthFirstMatch[4]) : new Date().getUTCFullYear();
    if (!isValidCalendarDate(year, month, startDay)) continue;
    dates.push(toMiddayDate(year, month, startDay));
    if (endDay != null && isValidCalendarDate(year, month, endDay)) dates.push(toMiddayDate(year, month, endDay));
  }

  const sorted = dates
    .filter((date) => !Number.isNaN(date.getTime()))
    .filter((date, index, collection) => collection.findIndex((candidate) => candidate.getTime() === date.getTime()) === index)
    .sort((a, b) => a.getTime() - b.getTime());

  if (sorted.length === 0) {
    return {
      startDate: fallbackDate && daysFromToday(fallbackDate) != null && daysFromToday(fallbackDate)! >= 0 ? fallbackDate : null,
      endDate: fallbackDate && daysFromToday(fallbackDate) != null && daysFromToday(fallbackDate)! >= 0 ? fallbackDate : null,
    };
  }

  return {
    startDate: sorted[0] ?? null,
    endDate: sorted[1] ?? sorted[0] ?? null,
  };
}

function computeDurationDays(startDate: Date | null, endDate: Date | null): number | null {
  if (!startDate || !endDate) return null;
  const diff = endDate.getTime() - startDate.getTime();
  const days = Math.floor(diff / (24 * 60 * 60 * 1000)) + 1;
  return days > 0 ? days : 1;
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}

function detectRegion(text: string, source: SourceWithOrganizer): { country: string | null; region: string | null; city: string | null } {
  const lower = text.toLowerCase();
  const matched = LOCATION_SIGNALS.find(({ keywords }) => keywords.some((keyword) => lower.includes(keyword)));
  const city = matched?.city ?? null;

  return {
    country: firstNonEmpty(matched?.country, source.country, city === "Dubai" ? "UAE" : city === "Bodrum" ? "Turkey" : "Russia"),
    region: firstNonEmpty(matched?.region, source.region, city),
    city,
  };
}

function matchesSourceName(source: SourceWithOrganizer, pattern: RegExp): boolean {
  return pattern.test(normalizeText(source.name));
}

function getWakeStyleLocationToken(text: string): string | null {
  return /лагер(?:ь|я)\s+в\s+([a-zа-яё-]+)/i.exec(text)?.[1]?.toLowerCase() ?? null;
}

function extractExplicitDateRange(
  text: string,
  fallbackDate: Date | null,
): { startDate: Date | null; endDate: Date | null } | null {
  const range =
    /(\d{1,2})\s*(?:-|–|—)\s*(\d{1,2})\s+(января|янв|февраля|фев|марта|мар|апреля|апр|мая|июня|июн|июля|июл|августа|авг|сентября|сент|сен|октября|окт|ноября|ноя|декабря|дек|january|jan|february|feb|march|mar|april|apr|may|june|jun|july|jul|august|aug|september|sep|october|oct|november|nov|december|dec)(?:\s+(\d{4}))?/i.exec(text);
  if (!range) return null;

  const month = MONTHS[range[3].toLowerCase()];
  const year = range[4] ? Number(range[4]) : (fallbackDate?.getUTCFullYear() ?? new Date().getUTCFullYear());
  const startDay = Number(range[1]);
  const endDay = Number(range[2]);
  if (!isValidCalendarDate(year, month, startDay) || !isValidCalendarDate(year, month, endDay)) return null;

  return {
    startDate: toMiddayDate(year, month, startDay),
    endDate: toMiddayDate(year, month, endDay),
  };
}

function formatNumericDateToken(day: number, month: number, year: number): string {
  return `${String(day).padStart(2, "0")}.${String(month).padStart(2, "0")}.${year}`;
}

function extractMultipleNumericDateRanges(text: string, fallbackDate: Date | null): ExplicitDateRange[] {
  const ranges: ExplicitDateRange[] = [];
  const pattern = /(\d{1,2})\.(\d{1,2})\s*(?:-|–|—)\s*(\d{1,2})\.(\d{1,2})(?:\.(\d{2,4}))?/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text)) !== null) {
    const startDay = Number(match[1]);
    const startMonth = Number(match[2]);
    const endDay = Number(match[3]);
    const endMonth = Number(match[4]);
    const baseYear =
      match[5] != null
        ? Number(match[5].length === 2 ? `20${match[5]}` : match[5])
        : (fallbackDate?.getUTCFullYear() ?? new Date().getUTCFullYear());
    const endYear = match[5] == null && endMonth < startMonth ? baseYear + 1 : baseYear;
    if (!isValidCalendarDate(baseYear, startMonth, startDay) || !isValidCalendarDate(endYear, endMonth, endDay)) {
      continue;
    }

    const startDate = toMiddayDate(baseYear, startMonth, startDay);
    const endDate = toMiddayDate(endYear, endMonth, endDay);
    ranges.push({
      startDate,
      endDate,
      label: `${formatNumericDateToken(startDay, startMonth, baseYear)} – ${formatNumericDateToken(endDay, endMonth, endYear)}`,
    });
  }

  return ranges
    .filter((range, index, collection) =>
      collection.findIndex(
        (candidate) =>
          candidate.startDate.getTime() === range.startDate.getTime() && candidate.endDate.getTime() === range.endDate.getTime(),
      ) === index,
    )
    .sort((left, right) => left.startDate.getTime() - right.startDate.getTime());
}

function formatDateRangeLabel(startDate: Date, endDate: Date): string {
  return `${formatNumericDateToken(startDate.getUTCDate(), startDate.getUTCMonth() + 1, startDate.getUTCFullYear())} – ${formatNumericDateToken(
    endDate.getUTCDate(),
    endDate.getUTCMonth() + 1,
    endDate.getUTCFullYear(),
  )}`;
}

function extractOffysDateRanges(text: string, fallbackDate: Date | null): SourceSpecificDateRange[] {
  const normalized = normalizeText(decodeHtmlEntities(text));
  const fallbackYear = fallbackDate?.getUTCFullYear() ?? new Date().getUTCFullYear();
  const locationLabel = /дагестан|сулак/i.test(normalized) ? "Дагестан" : /краснодар/i.test(normalized) ? "Краснодар" : null;
  const ranges: SourceSpecificDateRange[] = [];
  const resolveCrossMonthYear = (month: number, year: number) => {
    if (month > 1) return { month: month - 1, year };
    return { month: 12, year: year - 1 };
  };

  const pushRange = (startDate: Date, endDate: Date, matchIndex: number, matchValue: string) => {
    const trailingStart = Math.min(normalized.length, matchIndex + matchValue.length);
    const trailingRest = normalized.slice(trailingStart);
    const nextSlotBoundary = trailingRest.search(/\s(?:•|\d+\.)\s*\d{1,2}\s*(?:-|–|—)\s*\d/);
    const trailingContext =
      nextSlotBoundary >= 0
        ? trailingRest.slice(0, nextSlotBoundary)
        : trailingRest.slice(0, 42);
    const soldOut = /sold\s*out|солд\s*аут|зеро|zero|мест\s*нет/i.test(trailingContext);
    ranges.push({
      startDate,
      endDate,
      label: formatDateRangeLabel(startDate, endDate),
      soldOut,
      locationLabel,
    });
  };

  const monthWordPattern =
    /(?:^|[^\d.])(\d{1,2})\s*(?:-|–|—)\s*(\d{1,2})\s+(января|янв|февраля|фев|марта|мар|апреля|апр|мая|июня|июн|июля|июл|августа|авг|сентября|сент|сен|октября|окт|ноября|ноя|декабря|дек)(?:\s+(\d{4}))?/gi;
  let monthWordMatch: RegExpExecArray | null;
  while ((monthWordMatch = monthWordPattern.exec(normalized)) !== null) {
    const startDay = Number(monthWordMatch[1]);
    const endDay = Number(monthWordMatch[2]);
    const endMonth = MONTHS[monthWordMatch[3].toLowerCase()];
    const endYear = monthWordMatch[4] ? Number(monthWordMatch[4]) : fallbackYear;
    const startMonthYear = startDay > endDay ? resolveCrossMonthYear(endMonth, endYear) : { month: endMonth, year: endYear };
    if (
      !isValidCalendarDate(startMonthYear.year, startMonthYear.month, startDay) ||
      !isValidCalendarDate(endYear, endMonth, endDay)
    ) {
      continue;
    }
    pushRange(
      toMiddayDate(startMonthYear.year, startMonthYear.month, startDay),
      toMiddayDate(endYear, endMonth, endDay),
      monthWordMatch.index,
      monthWordMatch[0],
    );
  }

  const mixedNumericPattern = /(?:^|[^\d.])(\d{1,2})\s*(?:-|–|—)\s*(\d{1,2})\.(\d{1,2})(?:\.(\d{2,4}))?/g;
  let mixedNumericMatch: RegExpExecArray | null;
  while ((mixedNumericMatch = mixedNumericPattern.exec(normalized)) !== null) {
    const startDay = Number(mixedNumericMatch[1]);
    const endDay = Number(mixedNumericMatch[2]);
    const endMonth = Number(mixedNumericMatch[3]);
    const endYear =
      mixedNumericMatch[4] != null
        ? Number(mixedNumericMatch[4].length === 2 ? `20${mixedNumericMatch[4]}` : mixedNumericMatch[4])
        : fallbackYear;
    const startMonthYear = startDay > endDay ? resolveCrossMonthYear(endMonth, endYear) : { month: endMonth, year: endYear };
    if (
      !isValidCalendarDate(startMonthYear.year, startMonthYear.month, startDay) ||
      !isValidCalendarDate(endYear, endMonth, endDay)
    ) {
      continue;
    }
    pushRange(
      toMiddayDate(startMonthYear.year, startMonthYear.month, startDay),
      toMiddayDate(endYear, endMonth, endDay),
      mixedNumericMatch.index,
      mixedNumericMatch[0],
    );
  }

  return ranges
    .filter((range, index, collection) =>
      collection.findIndex(
        (candidate) =>
          candidate.startDate.getTime() === range.startDate.getTime() && candidate.endDate.getTime() === range.endDate.getTime(),
      ) === index,
    )
    .sort((left, right) => left.startDate.getTime() - right.startDate.getTime());
}

function extractSharedMonthDateRanges(text: string, fallbackDate: Date | null): ExplicitDateRange[] {
  const normalized = normalizeText(decodeHtmlEntities(text));
  const fallbackYear = fallbackDate?.getUTCFullYear() ?? new Date().getUTCFullYear();
  const ranges: ExplicitDateRange[] = [];
  const sharedMonthPattern =
    /((?:\d{1,2}\s*(?:-|–|—)\s*\d{1,2}\s*(?:\s*(?:,|и)\s*)?){1,6})\s*(января|янв|февраля|фев|марта|мар|апреля|апр|мая|июня|июн|июля|июл|августа|авг|сентября|сент|сен|октября|окт|ноября|ноя|декабря|дек)(?:\s+(\d{4}))?/gi;
  let sharedMonthMatch: RegExpExecArray | null;

  while ((sharedMonthMatch = sharedMonthPattern.exec(normalized)) !== null) {
    const month = MONTHS[sharedMonthMatch[2].toLowerCase()];
    const year = sharedMonthMatch[3] ? Number(sharedMonthMatch[3]) : fallbackYear;
    const pairPattern = /(\d{1,2})\s*(?:-|–|—)\s*(\d{1,2})/g;
    let pairMatch: RegExpExecArray | null;
    while ((pairMatch = pairPattern.exec(sharedMonthMatch[1])) !== null) {
      const startDay = Number(pairMatch[1]);
      const endDay = Number(pairMatch[2]);
      if (!isValidCalendarDate(year, month, startDay) || !isValidCalendarDate(year, month, endDay)) continue;
      const startDate = toMiddayDate(year, month, startDay);
      const endDate = toMiddayDate(year, month, endDay);
      ranges.push({
        startDate,
        endDate,
        label: formatDateRangeLabel(startDate, endDate),
      });
    }
  }

  return ranges
    .filter((range, index, collection) =>
      collection.findIndex(
        (candidate) =>
          candidate.startDate.getTime() === range.startDate.getTime() && candidate.endDate.getTime() === range.endDate.getTime(),
      ) === index,
    )
    .sort((left, right) => left.startDate.getTime() - right.startDate.getTime());
}

function listFullMondayFridayWeeks(year: number, month: number): ExplicitDateRange[] {
  const ranges: ExplicitDateRange[] = [];
  for (let day = 1; day <= 31; day += 1) {
    if (!isValidCalendarDate(year, month, day) || !isValidCalendarDate(year, month, day + 4)) continue;
    const candidate = toMiddayDate(year, month, day);
    if (candidate.getUTCDay() !== 1) continue;
    ranges.push({
      startDate: candidate,
      endDate: toMiddayDate(year, month, day + 4),
      label: formatDateRangeLabel(candidate, toMiddayDate(year, month, day + 4)),
    });
  }
  return ranges;
}

function getKitePiterChildrenCampSchedule(baseDate: Date = new Date()): ExplicitDateRange[] {
  const currentYear = baseDate.getUTCFullYear();
  const currentMonth = baseDate.getUTCMonth() + 1;
  const seasonYear = currentMonth > 8 ? currentYear + 1 : currentYear;
  const juneWeeks = listFullMondayFridayWeeks(seasonYear, 6);
  const julyWeeks = listFullMondayFridayWeeks(seasonYear, 7);
  const augustWeeks = listFullMondayFridayWeeks(seasonYear, 8);
  const lastJuneWeek = juneWeeks[juneWeeks.length - 1] ? [juneWeeks[juneWeeks.length - 1]] : [];
  return [...lastJuneWeek, ...julyWeeks.slice(0, 4), ...augustWeeks.slice(0, 2)];
}

function getNextWeekendDateRange(baseDate: Date): ExplicitDateRange {
  const cursor = toMiddayDate(baseDate.getUTCFullYear(), baseDate.getUTCMonth() + 1, baseDate.getUTCDate());
  while (cursor.getUTCDay() !== 6) {
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  const startDate = new Date(cursor);
  const endDate = new Date(cursor);
  endDate.setUTCDate(endDate.getUTCDate() + 1);
  return {
    startDate,
    endDate,
    label: formatDateRangeLabel(startDate, endDate),
  };
}

function applyKitePiterOverrides(
  rawItem: RawItemWithSource,
  normalized: Omit<NormalizedDraft, "scores">,
): Omit<NormalizedDraft, "scores"> {
  if (!matchesSourceName(rawItem.source, /kitepiter/i)) return normalized;
  const rawPayload =
    rawItem.rawPayloadJson && typeof rawItem.rawPayloadJson === "object" && !Array.isArray(rawItem.rawPayloadJson)
      ? (rawItem.rawPayloadJson as Record<string, unknown>)
      : null;
  const isChildrenSlot = rawPayload?.sourceSpecificSplit === "kitepiter_children_camp_slots";
  const isSafariSlot = rawPayload?.sourceSpecificSplit === "kitepiter_safari_slots";
  if (!isChildrenSlot && !isSafariSlot) return normalized;

  const slotLabel = typeof rawPayload?.slotLabel === "string" ? rawPayload.slotLabel : null;
  const text = normalizeText(decodeHtmlEntities(rawItem.rawText ?? ""));
  const dateRange = extractMultipleNumericDateRanges(text, rawItem.publishedAt)[0] ?? extractExplicitDateRange(text, rawItem.publishedAt);

  if (isSafariSlot) {
    return {
      ...normalized,
      eventType: "trip",
      discipline: "Kite",
      title: `KitePiter · кайт-сафари · Египет${slotLabel ? ` · ${slotLabel}` : ""}`,
      descriptionShort: "Кайт-сафари KitePiter в Египте: недельный выезд на Красное море с катанием и проживанием на лодке.",
      descriptionFull:
        "Кайт-сафари KitePiter в Египте. Формат — недельный выезд на Красное море для кайтсерфинга, бронирование и подробности — через сайт сезона и команду KitePiter.",
      country: "Egypt",
      region: "Красное море",
      city: "Красное море",
      venue: "KitePiter · кайт-сафари",
      startDate: dateRange?.startDate ?? normalized.startDate,
      endDate: dateRange?.endDate ?? normalized.endDate,
      durationDays: computeDurationDays(dateRange?.startDate ?? normalized.startDate, dateRange?.endDate ?? normalized.endDate),
      organizerName: "KitePiter",
      bookingUrl: "https://kite-safari-season.ru/",
      parseVersion: "v1_rules_kitepiter_safari",
      extractedJson: {
        ...(typeof normalized.extractedJson === "object" && normalized.extractedJson && !Array.isArray(normalized.extractedJson)
          ? normalized.extractedJson
          : {}),
        sourceSpecificProfile: "kitepiter_safari_slots",
        hasExplicitDateSignal: true,
      } as Prisma.InputJsonValue,
    };
  }

  return {
    ...normalized,
    eventType: "camp",
    discipline: "Kite",
    title: `KitePiter · Детский лагерь в СПб${slotLabel ? ` · ${slotLabel}` : ""}`,
    descriptionShort:
      "Пятидневный детский кайт-лагерь KitePiter в Санкт-Петербурге: смены по будням, обучение, оборудование и сопровождение инструкторов.",
    descriptionFull:
      "Детский кайт-лагерь KitePiter в Санкт-Петербурге. Смена длится 5 дней, формат рассчитан на детей и подростков, включает обучение и работу с оборудованием под сопровождением инструкторов KitePiter.",
    country: "Russia",
    region: "Санкт-Петербург",
    city: "Санкт-Петербург",
    venue: "KitePiter · Санкт-Петербург",
    startDate: dateRange?.startDate ?? normalized.startDate,
    endDate: dateRange?.endDate ?? normalized.endDate,
    durationDays: computeDurationDays(dateRange?.startDate ?? normalized.startDate, dateRange?.endDate ?? normalized.endDate),
    level: normalized.level ?? "beginner",
    priceFrom: 44000,
    currency: "RUB",
    organizerName: "KitePiter",
    bookingUrl: rawItem.sourceUrl ?? normalized.bookingUrl,
    parseVersion: "v1_rules_kitepiter_children_camp",
    extractedJson: {
      ...(typeof normalized.extractedJson === "object" && normalized.extractedJson && !Array.isArray(normalized.extractedJson)
        ? normalized.extractedJson
        : {}),
      sourceSpecificProfile: "kitepiter_children_camp_slots",
      hasExplicitDateSignal: true,
      inferredFromSourceSchedule: true,
    } as Prisma.InputJsonValue,
  };
}

function applyTeamSergeevTelegramOverrides(
  rawItem: RawItemWithSource,
  normalized: Omit<NormalizedDraft, "scores">,
): Omit<NormalizedDraft, "scores"> {
  if (!matchesSourceName(rawItem.source, /team\s+sergeev\s+telegram/i)) return normalized;
  const text = normalizeText(decodeHtmlEntities(rawItem.rawText ?? ""));
  if (!/минисбор|мини\s+сбор/i.test(text) || !/кировск/i.test(text) || !/следующ.*уикенд/i.test(text)) return normalized;

  const inferredRange = rawItem.publishedAt ? getNextWeekendDateRange(rawItem.publishedAt) : null;
  return {
    ...normalized,
    eventType: "camp",
    discipline: "Ski",
    title: "Team Sergeev · мини-сбор · Кировск",
    descriptionShort: "Короткий горнолыжный мини-сбор Team Sergeev в Кировске на следующий уикенд после публикации анонса в Telegram.",
    descriptionFull:
      "Мини-сбор Team Sergeev в Кировске для взрослых участников. Даты вычислены из относительной формулировки «на следующий уикенд» в Telegram-посте от 12 апреля 2026 года. Контакт и присоединение — через личное сообщение организатору.",
    country: "Russia",
    region: "Мурманская область",
    city: "Кировск",
    venue: "Кировск",
    startDate: inferredRange?.startDate ?? normalized.startDate,
    endDate: inferredRange?.endDate ?? normalized.endDate,
    durationDays: computeDurationDays(inferredRange?.startDate ?? normalized.startDate, inferredRange?.endDate ?? normalized.endDate),
    organizerName: "Team Sergeev",
    bookingUrl: rawItem.sourceUrl ?? normalized.bookingUrl,
    parseVersion: "v1_rules_team_sergeev_telegram_mini_camp",
    extractedJson: {
      ...(typeof normalized.extractedJson === "object" && normalized.extractedJson && !Array.isArray(normalized.extractedJson)
        ? normalized.extractedJson
        : {}),
      sourceSpecificProfile: "team_sergeev_telegram_mini_camp",
      hasExplicitDateSignal: true,
      inferredRelativeDate: true,
    } as Prisma.InputJsonValue,
  };
}

function applyTalkToFishOverrides(
  rawItem: RawItemWithSource,
  normalized: Omit<NormalizedDraft, "scores">,
): Omit<NormalizedDraft, "scores"> {
  if (!matchesSourceName(rawItem.source, /talk\s*to\s*fish|kristina\s+kolesnikova/i)) return normalized;
  const rawPayload =
    rawItem.rawPayloadJson && typeof rawItem.rawPayloadJson === "object" && !Array.isArray(rawItem.rawPayloadJson)
      ? (rawItem.rawPayloadJson as Record<string, unknown>)
      : null;
  if (rawPayload?.sourceSpecificSplit !== "talktofish_winter_camp_slots") return normalized;

  const slotLocation = typeof rawPayload.slotLocation === "string" ? rawPayload.slotLocation : "локация уточняется";
  const slotCountry = typeof rawPayload.slotCountry === "string" ? rawPayload.slotCountry : slotLocation;
  const slotCity = typeof rawPayload.slotCity === "string" ? rawPayload.slotCity : slotLocation;
  const slotLabel = typeof rawPayload.slotLabel === "string" ? rawPayload.slotLabel : null;
  const slotTheme = typeof rawPayload.slotTheme === "string" ? rawPayload.slotTheme : null;
  const dateRange = extractMultipleNumericDateRanges(rawItem.rawText ?? "", rawItem.publishedAt)[0] ?? extractExplicitDateRange(rawItem.rawText ?? "", rawItem.publishedAt);

  return {
    ...normalized,
    eventType: "camp",
    discipline: "Wakesurf",
    title: `Talk to Fish · вейксерф-кэмп · ${slotLocation}${slotLabel ? ` · ${slotLabel}` : ""}`,
    descriptionShort: `Камерный вейксерф-кэмп Кристины Колесниковой: ${slotLocation}, даты ${slotLabel ?? "уточняются"}, фокус на катании, тренировках и travel-формате.`,
    descriptionFull:
      `Вейксерф-кэмп Talk to Fish / Кристины Колесниковой. Локация: ${slotLocation}. Даты: ${slotLabel ?? "уточняются"}. ` +
      `${slotTheme ? `${slotTheme} ` : ""}` +
      "Подробности, свободные места и запись — через Telegram-пост и личный контакт организатора.",
    country: slotCountry,
    region: slotLocation,
    city: slotCity,
    venue: slotLocation,
    startDate: dateRange?.startDate ?? normalized.startDate,
    endDate: dateRange?.endDate ?? normalized.endDate,
    durationDays: computeDurationDays(dateRange?.startDate ?? normalized.startDate, dateRange?.endDate ?? normalized.endDate),
    level: normalized.level ?? "all_levels",
    organizerName: "Talk to Fish / Kristina Kolesnikova",
    bookingUrl: rawItem.sourceUrl ?? normalized.bookingUrl ?? "https://t.me/talktofish",
    parseVersion: "v1_rules_talktofish_winter_camps",
    extractedJson: {
      ...(typeof normalized.extractedJson === "object" && normalized.extractedJson && !Array.isArray(normalized.extractedJson)
        ? normalized.extractedJson
        : {}),
      sourceSpecificProfile: "talktofish_winter_camp_slots",
      hasExplicitDateSignal: true,
      inferredFromMultiSlotTelegramPost: true,
    } as Prisma.InputJsonValue,
  };
}

function applyWakeStyleClubOverrides(rawItem: RawItemWithSource, normalized: Omit<NormalizedDraft, "scores">): Omit<NormalizedDraft, "scores"> {
  if (!matchesSourceName(rawItem.source, /wakestyle/i)) return normalized;

  const text = normalizeText(decodeHtmlEntities(rawItem.rawText ?? ""));
  const locationToken = getWakeStyleLocationToken(text);
  const location = locationToken ? WAKESTYLE_LOCATION_OVERRIDES[locationToken] ?? null : null;
  const dateRange = extractExplicitDateRange(text, rawItem.publishedAt);
  const isCamp = /лагер(?:ь|я)|кэмп|кемп/i.test(text);

  return {
    ...normalized,
    eventType: isCamp ? "camp" : normalized.eventType,
    title: isCamp ? `Лагерь WakeStyleClub${location?.city ? ` · ${location.city}` : ""}` : normalized.title,
    country: location?.country ?? normalized.country,
    region: location?.region ?? normalized.region,
    city: location?.city ?? normalized.city,
    venue: location?.city ?? normalized.venue,
    startDate: dateRange?.startDate ?? normalized.startDate,
    endDate: dateRange?.endDate ?? normalized.endDate,
    durationDays: computeDurationDays(dateRange?.startDate ?? normalized.startDate, dateRange?.endDate ?? normalized.endDate),
    priceFrom: /цена\s+по\s+запрос/i.test(text) ? null : normalized.priceFrom,
    currency: /цена\s+по\s+запрос/i.test(text) ? null : normalized.currency,
    parseVersion: "v1_rules_wakestyle",
    extractedJson: {
      ...(typeof normalized.extractedJson === "object" && normalized.extractedJson && !Array.isArray(normalized.extractedJson)
        ? normalized.extractedJson
        : {}),
      sourceSpecificProfile: "wakestyleclub_telegram",
      extractedCampLocation: location?.city ?? null,
    } as Prisma.InputJsonValue,
  };
}

function applyWhitePeaksOverrides(rawItem: RawItemWithSource, normalized: Omit<NormalizedDraft, "scores">): Omit<NormalizedDraft, "scores"> {
  if (!matchesSourceName(rawItem.source, /whitepeaks/i)) return normalized;
  if (!normalized.bookingUrl || !/whitepeaks\.ru\/Programs\//i.test(normalized.bookingUrl)) return normalized;

  const decodedRawText = decodeHtmlEntities(rawItem.rawText ?? "");
  const segmentMatch = new RegExp(`${escapeRegExp(normalized.bookingUrl)}[^>]*>\\s*([\\s\\S]{0,500}?)(?=(?:href=|БЛОГ|$))`, "i").exec(decodedRawText);
  if (!segmentMatch) return normalized;

  const segment = stripHtmlLikeTags(segmentMatch[1]);
  const titlePriceDateMatch =
    /^(?<title>.+?)\s+(?<price>\d[\d\s]*(?:руб|₽|\$|€))\.?\s+(?<dates>(?:\d{1,2}\s*(?:-|–|—)\s*\d{1,2}\s+[а-яёa-z]+(?:\s+\d{4})?)|(?:май-июнь|июль-август|август-сентябрь)\s+\d{4}|(?:\d{1,2}\s+[а-яёa-z]+(?:\s*(?:-|–|—)\s*\d{1,2}\s+[а-яёa-z]+)?\s+\d{4}))/i.exec(
      segment,
    );

  const candidateTitle = normalizeText(titlePriceDateMatch?.groups?.title ?? segment.split(/\s{2,}|\.(?=\s|$)/)[0] ?? normalized.title ?? "");
  const price = extractPrice(segment.toLowerCase());
  const extractedDates = extractDates(segment.toLowerCase(), null);
  const region = detectRegion(segment.toLowerCase(), rawItem.source);

  return {
    ...normalized,
    title: firstNonEmpty(candidateTitle, normalized.title),
    descriptionShort: truncate(segment, 220),
    descriptionFull: segment,
    country: region.country ?? normalized.country,
    region: region.region ?? normalized.region,
    city: region.city ?? normalized.city,
    venue: region.city ?? normalized.venue,
    startDate: extractedDates.startDate ?? normalized.startDate,
    endDate: extractedDates.endDate ?? normalized.endDate,
    durationDays: computeDurationDays(extractedDates.startDate ?? normalized.startDate, extractedDates.endDate ?? normalized.endDate),
    priceFrom: price.priceFrom ?? normalized.priceFrom,
    currency: price.currency ?? normalized.currency,
    parseVersion: "v1_rules_whitepeaks",
    extractedJson: {
      ...(typeof normalized.extractedJson === "object" && normalized.extractedJson && !Array.isArray(normalized.extractedJson)
        ? normalized.extractedJson
        : {}),
      sourceSpecificProfile: "whitepeaks_program_listing",
      hasExplicitDateSignal: hasExplicitDateSignal(segment.toLowerCase()),
      whitePeaksSegment: truncate(segment, 500),
    } as Prisma.InputJsonValue,
  };
}

function applySaratovSurfCampOverrides(rawItem: RawItemWithSource, normalized: Omit<NormalizedDraft, "scores">): Omit<NormalizedDraft, "scores"> {
  if (!matchesSourceName(rawItem.source, /saratovsurfcamp/i)) return normalized;

  const title = normalizeText(decodeHtmlEntities(rawItem.rawTitle ?? ""));
  const text = normalizeText(decodeHtmlEntities(rawItem.rawText ?? ""));
  const lower = `${title} ${text}`.toLowerCase();
  const isClubPassPage = /абонемент/i.test(lower) && /май-июн/i.test(lower);
  if (!isClubPassPage) return normalized;

  const startDate = toMiddayDate(2026, 5, 1);
  const endDate = toMiddayDate(2026, 6, 30);
  const descriptionShort = truncate(
    "Абонементы SaratovSurfCamp на май–июнь: тренировки и катания по вейксерфу на Волге, спот на территории Резиденции «Мария», 20 минут от центра Саратова.",
    220,
  );

  return {
    ...normalized,
    eventType: "training",
    discipline: "Wakesurf",
    title: "SaratovSurfCamp · абонементы на май–июнь",
    descriptionShort,
    descriptionFull: text || normalized.descriptionFull,
    country: "Russia",
    region: "Саратовская область",
    city: "Саратов",
    venue: "Резиденция «Мария»",
    startDate,
    endDate,
    durationDays: computeDurationDays(startDate, endDate),
    level: normalized.level ?? "all_levels",
    priceFrom: null,
    currency: "RUB",
    parseVersion: "v1_rules_saratovsurfcamp",
    extractedJson: {
      ...(typeof normalized.extractedJson === "object" && normalized.extractedJson && !Array.isArray(normalized.extractedJson)
        ? normalized.extractedJson
        : {}),
      sourceSpecificProfile: "saratovsurfcamp_membership",
      hasExplicitDateSignal: true,
      normalizedFromMembershipPage: true,
    } as Prisma.InputJsonValue,
  };
}

function applyFreerideRussiaOverrides(rawItem: RawItemWithSource, normalized: Omit<NormalizedDraft, "scores">): Omit<NormalizedDraft, "scores"> {
  if (!matchesSourceName(rawItem.source, /freeride\s*russia/i)) return normalized;

  const title = normalizeText(decodeHtmlEntities(rawItem.rawTitle ?? ""));
  const text = normalizeText(decodeHtmlEntities(rawItem.rawText ?? ""));
  const lower = `${title} ${text}`.toLowerCase();
  const isAnnapurnaTrip =
    /аннапурн|annapurn/i.test(lower) &&
    /непал|nepal/i.test(lower) &&
    /с\s*2\s*по\s*18\s*мая|2\s*(?:-|–|—)\s*18\s*мая/i.test(lower);

  if (!isAnnapurnaTrip) return normalized;

  const startDate = toMiddayDate(2026, 5, 2);
  const endDate = toMiddayDate(2026, 5, 18);

  return {
    ...normalized,
    eventType: "expedition",
    discipline: "Expedition",
    title: "Freeride Russia · Трекинг вокруг Аннапурны",
    descriptionShort: truncate(
      "Экспедиция Freeride Russia в Непал: трекинг вокруг Аннапурны с 2 по 18 мая, присоединение по запросу через личный контакт организатора.",
      220,
    ),
    descriptionFull: text || normalized.descriptionFull,
    country: "Nepal",
    region: "Annapurna",
    city: null,
    venue: "Annapurna Circuit",
    startDate,
    endDate,
    durationDays: computeDurationDays(startDate, endDate),
    level: normalized.level ?? "intermediate",
    priceFrom: null,
    currency: null,
    organizerName: "Freeride Russia",
    bookingUrl: "https://t.me/igor_ilinykh",
    parseVersion: "v1_rules_freeriderussia",
    extractedJson: {
      ...(typeof normalized.extractedJson === "object" && normalized.extractedJson && !Array.isArray(normalized.extractedJson)
        ? normalized.extractedJson
        : {}),
      sourceSpecificProfile: "freeriderussia_annapurna_trip",
      hasExplicitDateSignal: true,
      normalizedFromTelegramDeepPage: true,
    } as Prisma.InputJsonValue,
  };
}

function applyQuiksilverKamchatkaOverrides(rawItem: RawItemWithSource, normalized: Omit<NormalizedDraft, "scores">): Omit<NormalizedDraft, "scores"> {
  if (!matchesSourceName(rawItem.source, /quiksilver\s*surf\s*camp/i)) return normalized;

  const title = normalizeText(decodeHtmlEntities(rawItem.rawTitle ?? ""));
  const text = normalizeText(decodeHtmlEntities(rawItem.rawText ?? ""));
  const lower = `${title} ${text}`.toLowerCase();
  const isKamchatkaCampPage =
    /(kamchatka\.surf\/surftours|серф-кэмпы на камчатке|серф-кэмп от quiksilver surf camp)/i.test(lower) &&
    /(5\s*(?:-|–|—)\s*15\s*июля|16\s*(?:-|–|—)\s*26\s*июля|7\s*(?:-|–|—)\s*17\s*августа|18\s*(?:-|–|—)\s*28\s*августа)/i.test(lower);

  if (!isKamchatkaCampPage) return normalized;

  const schedule = [
    {
      pattern: /5\s*(?:-|–|—)\s*15\s*июля/i,
      startDate: toMiddayDate(2026, 7, 5),
      endDate: toMiddayDate(2026, 7, 15),
      priceFrom: 238000,
    },
    {
      pattern: /16\s*(?:-|–|—)\s*26\s*июля/i,
      startDate: toMiddayDate(2026, 7, 16),
      endDate: toMiddayDate(2026, 7, 26),
      priceFrom: 245000,
    },
    {
      pattern: /7\s*(?:-|–|—)\s*17\s*августа/i,
      startDate: toMiddayDate(2026, 8, 7),
      endDate: toMiddayDate(2026, 8, 17),
      priceFrom: 245000,
    },
    {
      pattern: /18\s*(?:-|–|—)\s*28\s*августа/i,
      startDate: toMiddayDate(2026, 8, 18),
      endDate: toMiddayDate(2026, 8, 28),
      priceFrom: 238000,
    },
  ].find((entry) => entry.pattern.test(lower));

  if (!schedule) return normalized;

  const description =
    "Серф-кэмп Quiksilver на Камчатке: 10 ночей в серф-доме с видом на Авачинскую бухту, океан, вулканы и термальные источники.";

  return {
    ...normalized,
    eventType: "camp",
    discipline: "Surf",
    title: "QUIKSILVER SURF CAMP · Камчатка",
    descriptionShort: truncate(description, 220),
    descriptionFull: text || normalized.descriptionFull,
    country: "Russia",
    region: "Камчатка",
    city: "Петропавловск-Камчатский",
    venue: "Авачинская бухта",
    startDate: schedule.startDate,
    endDate: schedule.endDate,
    durationDays: computeDurationDays(schedule.startDate, schedule.endDate),
    level: normalized.level ?? "all_levels",
    priceFrom: normalized.priceFrom ?? schedule.priceFrom,
    currency: "RUB",
    organizerName: "Quiksilver Surf Camp Kamchatka",
    bookingUrl: "https://kamchatka.surf/surftours",
    parseVersion: "v1_rules_quiksilver_kamchatka",
    extractedJson: {
      ...(typeof normalized.extractedJson === "object" && normalized.extractedJson && !Array.isArray(normalized.extractedJson)
        ? normalized.extractedJson
        : {}),
      sourceSpecificProfile: "quiksilver_kamchatka_surftours",
      hasExplicitDateSignal: true,
      normalizedFromSchedulePage: true,
    } as Prisma.InputJsonValue,
  };
}

function applyWakeHouseOverrides(rawItem: RawItemWithSource, normalized: Omit<NormalizedDraft, "scores">): Omit<NormalizedDraft, "scores"> {
  if (!matchesSourceName(rawItem.source, /wakehouse/i)) return normalized;
  const text = normalizeText(decodeHtmlEntities(rawItem.rawText ?? ""));
  if (!/wakehouse camp|кемп/i.test(text)) return normalized;

  const hasSevenDaySignal = /7\s*(?:дн|дней|дня)|7\s*ноч/i.test(text);
  const endDate =
    normalized.startDate && normalized.endDate && normalized.endDate.getTime() === normalized.startDate.getTime() && hasSevenDaySignal
      ? addDays(normalized.startDate, 6)
      : normalized.endDate;

  return {
    ...normalized,
    eventType: "camp",
    discipline: normalized.discipline ?? "Wakesurf",
    title: "WakeHouse Camp · Краснодар",
    country: normalized.country ?? "Russia",
    region: normalized.region ?? "Krasnodar",
    city: normalized.city ?? "Krasnodar",
    venue: normalized.venue ?? "Краснодар",
    endDate,
    durationDays: computeDurationDays(normalized.startDate, endDate),
    parseVersion: "v1_rules_wakehouse",
    extractedJson: {
      ...(typeof normalized.extractedJson === "object" && normalized.extractedJson && !Array.isArray(normalized.extractedJson)
        ? normalized.extractedJson
        : {}),
      sourceSpecificProfile: "wakehouse_instagram_camp",
      hasExplicitDateSignal: true,
    } as Prisma.InputJsonValue,
  };
}

function applyOffysOverrides(rawItem: RawItemWithSource, normalized: Omit<NormalizedDraft, "scores">): Omit<NormalizedDraft, "scores"> {
  if (!matchesSourceName(rawItem.source, /offys/i)) return normalized;
  const text = normalizeText(decodeHtmlEntities(rawItem.rawText ?? ""));
  const rawPayload =
    rawItem.rawPayloadJson && typeof rawItem.rawPayloadJson === "object" && !Array.isArray(rawItem.rawPayloadJson)
      ? (rawItem.rawPayloadJson as Record<string, unknown>)
      : null;
  const isSourceSpecificSlot = rawPayload?.sourceSpecificSplit === "offys_slots";
  if (!/кемп|кемпы|camp|дагестан/i.test(text)) return normalized;
  if (!isSourceSpecificSlot && extractOffysDateRanges(text, rawItem.publishedAt).length > 1) return normalized;

  const hasSevenDaySignal = /7\s*(?:дн|дней|дня)|7\s*ноч/i.test(text);
  const endDate =
    normalized.startDate && normalized.endDate && normalized.endDate.getTime() === normalized.startDate.getTime() && hasSevenDaySignal
      ? addDays(normalized.startDate, 6)
      : normalized.endDate;
  const isDagestan = /дагестан|сулак/i.test(text);
  const locationLabel = isDagestan ? "Дагестан" : "Краснодар";
  const titleSuffix = normalized.startDate && endDate ? ` · ${formatDateRangeLabel(normalized.startDate, endDate)}` : "";
  const priceFrom = /115(?:\s*к|000)/i.test(text) ? 115000 : /85(?:\s*к|000)/i.test(text) ? 85000 : normalized.priceFrom;
  const venue = isDagestan ? (/главрыба/i.test(text) ? "Главрыба" : "Сулакский каньон") : "Краснодар";

  return {
    ...normalized,
    eventType: "camp",
    discipline: normalized.discipline ?? "Wakesurf",
    title: `Offys Camp · ${locationLabel}${titleSuffix}`,
    country: "Russia",
    region: isDagestan ? "Дагестан" : "Krasnodar",
    city: isDagestan ? "Сулакский каньон" : "Krasnodar",
    venue: normalized.venue ?? venue,
    endDate,
    durationDays: computeDurationDays(normalized.startDate, endDate),
    organizerName: normalized.organizerName ?? "Offys Wakesurf",
    priceFrom,
    currency: priceFrom ? "RUB" : normalized.currency,
    parseVersion: "v2_rules_offys",
    extractedJson: {
      ...(typeof normalized.extractedJson === "object" && normalized.extractedJson && !Array.isArray(normalized.extractedJson)
        ? normalized.extractedJson
        : {}),
      sourceSpecificProfile: isDagestan ? "offys_instagram_dagestan_slots" : "offys_instagram_krasnodar_slots",
      hasExplicitDateSignal: true,
    } as Prisma.InputJsonValue,
  };
}

function applyBonusSummerCampOverrides(rawItem: RawItemWithSource, normalized: Omit<NormalizedDraft, "scores">): Omit<NormalizedDraft, "scores"> {
  if (!matchesSourceName(rawItem.source, /bonus\s*summer\s*camp/i)) return normalized;
  const text = normalizeText(decodeHtmlEntities(rawItem.rawText ?? ""));
  if (!/bonus\s*summer\s*camp|лагерь-фестивал/i.test(text)) return normalized;

  return {
    ...normalized,
    eventType: "camp",
    discipline: normalized.discipline ?? "Snowboard",
    title: "Bonus Summer Camp 2026 · Красная Поляна",
    country: normalized.country ?? "Russia",
    region: normalized.region ?? "Сочи",
    city: normalized.city ?? "Сочи",
    venue: normalized.venue ?? "Курорт Красная Поляна",
    organizerName: normalized.organizerName ?? "Bonus Summer Camp",
    parseVersion: "v1_rules_bonus_summer_camp",
    extractedJson: {
      ...(typeof normalized.extractedJson === "object" && normalized.extractedJson && !Array.isArray(normalized.extractedJson)
        ? normalized.extractedJson
        : {}),
      sourceSpecificProfile: "bonus_summer_camp_instagram",
      hasExplicitDateSignal: true,
    } as Prisma.InputJsonValue,
  };
}

function applyRiverSurfOverrides(rawItem: RawItemWithSource, normalized: Omit<NormalizedDraft, "scores">): Omit<NormalizedDraft, "scores"> {
  if (!matchesSourceName(rawItem.source, /riversurf/i)) return normalized;
  const text = normalizeText(decodeHtmlEntities(rawItem.rawText ?? ""));
  if (/lazy_camp|мини\s*@?lazy_camp|мини\s+lazy\s+camp/i.test(text)) {
    return {
      ...normalized,
      eventType: "camp",
      discipline: normalized.discipline ?? "Wakesurf",
      title: "RiverSurf Zavidovo · mini Lazy Camp",
      country: normalized.country ?? "Russia",
      region: normalized.region ?? "Тверская область",
      city: normalized.city ?? "Завидово",
      venue: normalized.venue ?? "RiverSurf Zavidovo",
      parseVersion: "v1_rules_riversurf_lazycamp",
      extractedJson: {
        ...(typeof normalized.extractedJson === "object" && normalized.extractedJson && !Array.isArray(normalized.extractedJson)
          ? normalized.extractedJson
          : {}),
        sourceSpecificProfile: "riversurf_instagram_lazy_camp",
        hasExplicitDateSignal: true,
      } as Prisma.InputJsonValue,
    };
  }
  if (!/запись на катание|тренировк/i.test(text) || !/краснодар/i.test(text)) return normalized;

  return {
    ...normalized,
    eventType: "training",
    discipline: normalized.discipline ?? "Wakesurf",
    title: "RiverSurf Zavidovo · катание и тренировки в Краснодаре",
    country: normalized.country ?? "Russia",
    region: normalized.region ?? "Krasnodar",
    city: normalized.city ?? "Krasnodar",
    venue: normalized.venue ?? "Краснодар",
    parseVersion: "v1_rules_riversurf",
    extractedJson: {
      ...(typeof normalized.extractedJson === "object" && normalized.extractedJson && !Array.isArray(normalized.extractedJson)
        ? normalized.extractedJson
        : {}),
      sourceSpecificProfile: "riversurf_instagram_training",
      hasExplicitDateSignal: true,
    } as Prisma.InputJsonValue,
  };
}

function applyMouseBikeHouseOverrides(
  rawItem: RawItemWithSource,
  normalized: Omit<NormalizedDraft, "scores">,
): Omit<NormalizedDraft, "scores"> {
  if (!matchesSourceName(rawItem.source, /mouse\s*bike\s*house|мышовня/i)) return normalized;
  const text = normalizeText(decodeHtmlEntities(rawItem.rawText ?? ""));
  if (!/camp|кэмп|сбор|сборы|велолагер/i.test(text)) return normalized;

  const tgBookingUrl = "https://t.me/mousebikehouse";
  const base = {
    ...normalized,
    eventType: "camp",
    discipline: "MTB",
    country: normalized.country ?? "Russia",
    region: normalized.region ?? "Краснодарский край",
    city: normalized.city ?? "Собер-Баш",
    venue: normalized.venue ?? "Mouse Bike House · Собер-Баш",
    organizerName: "Mouse Bike House",
    bookingUrl: tgBookingUrl,
  };

  if (/scout\s*camp/i.test(text)) {
    return {
      ...base,
      title: "Mouse Bike House · Scout Camp",
      descriptionShort:
        "MTB-кэмп для начинающих на Собер-Баш: база, баланс, чтение трассы, красные трейлы и безопасный прогресс на спусковых участках.",
      descriptionFull:
        "Scout Camp в Mouse Bike House на Собер-Баш: тренировки для начинающих с фокусом на базовую стойку, баланс, чтение трассы и постепенный переход к красным трейлам. Запись через администратора @mousebikehouse.",
      level: "beginner",
      parseVersion: "v1_rules_mouse_bike_house_scout_camp",
      extractedJson: {
        ...(typeof normalized.extractedJson === "object" && normalized.extractedJson && !Array.isArray(normalized.extractedJson)
          ? normalized.extractedJson
          : {}),
        sourceSpecificProfile: "mouse_bike_house_scout_camp",
        hasExplicitDateSignal: true,
      } as Prisma.InputJsonValue,
    };
  }

  if (/даты обучающих сборов уже готовы|сборы для начинающих/i.test(text)) {
    return {
      ...base,
      title: "Mouse Bike House · MTB-сбор для начинающих",
      descriptionShort:
        "Обучающий MTB-сбор на Собер-Баш для тех, кто хочет уверенно начать кататься в горах и собрать базовую технику на трассах.",
      descriptionFull:
        "Обучающий сбор Mouse Bike House для начинающих на Собер-Баш. В программе база техники, баланс, чтение трассы и сопровождение на спусках. Запись на кэмпы через администратора @mousebikehouse.",
      level: "beginner",
      parseVersion: "v1_rules_mouse_bike_house_beginner_camp",
      extractedJson: {
        ...(typeof normalized.extractedJson === "object" && normalized.extractedJson && !Array.isArray(normalized.extractedJson)
          ? normalized.extractedJson
          : {}),
        sourceSpecificProfile: "mouse_bike_house_beginner_camp",
        hasExplicitDateSignal: true,
      } as Prisma.InputJsonValue,
    };
  }

  if (/велолагеря для прогрессирующих|прогрессирующих/i.test(text)) {
    return {
      ...base,
      title: "Mouse Bike House · Велолагерь для прогрессирующих",
      descriptionShort:
        "MTB-лагерь на Собер-Баш для райдеров с базой: траектории, стабильность на трейлах, скорость и безопасная работа с трамплинами.",
      descriptionFull:
        "Велолагерь Mouse Bike House для прогрессирующих райдеров на Собер-Баш. В программе разбор траекторий, стабильность на трейлах, работа над скоростью и безопасное освоение более сложных элементов.",
      level: "intermediate",
      parseVersion: "v1_rules_mouse_bike_house_progression_camp",
      extractedJson: {
        ...(typeof normalized.extractedJson === "object" && normalized.extractedJson && !Array.isArray(normalized.extractedJson)
          ? normalized.extractedJson
          : {}),
        sourceSpecificProfile: "mouse_bike_house_progression_camp",
        hasExplicitDateSignal: true,
      } as Prisma.InputJsonValue,
    };
  }

  return base;
}

function applyKaifCampOverrides(rawItem: RawItemWithSource, normalized: Omit<NormalizedDraft, "scores">): Omit<NormalizedDraft, "scores"> {
  if (!matchesSourceName(rawItem.source, /kaif/i)) return normalized;
  const text = normalizeText(decodeHtmlEntities(rawItem.rawText ?? ""));
  if (!/вейксерф|wakesurf|кемп|кэмп|camp|мармарис|marmaris/i.test(text)) return normalized;

  const dateRange = extractMultipleNumericDateRanges(text, rawItem.publishedAt)[0] ?? extractExplicitDateRange(text, rawItem.publishedAt);
  const title =
    rawItem.rawTitle && /^kaif camp/i.test(normalizeText(rawItem.rawTitle))
      ? normalizeText(rawItem.rawTitle)
      : normalized.title && /^kaif camp/i.test(normalized.title)
        ? normalized.title
        : `Kaif Camp · Мармарис${dateRange?.startDate ? ` · ${dateRange.startDate.toISOString().slice(0, 10)}` : ""}`;

  return {
    ...normalized,
    eventType: "camp",
    discipline: "Wakesurf",
    title,
    country: "Turkey",
    region: "Marmaris",
    city: "Marmaris",
    venue: "Kaif Camp · Marmaris",
    organizerName: "Kaif Camp",
    bookingUrl: rawItem.sourceUrl ?? normalized.bookingUrl,
    startDate: dateRange?.startDate ?? normalized.startDate,
    endDate: dateRange?.endDate ?? normalized.endDate,
    durationDays: computeDurationDays(dateRange?.startDate ?? normalized.startDate, dateRange?.endDate ?? normalized.endDate),
    parseVersion: "v1_rules_kaif_camp",
    extractedJson: {
      ...(typeof normalized.extractedJson === "object" && normalized.extractedJson && !Array.isArray(normalized.extractedJson)
        ? normalized.extractedJson
        : {}),
      sourceSpecificProfile: "kaif_camp_instagram_slots",
      hasExplicitDateSignal: true,
    } as Prisma.InputJsonValue,
  };
}

function applySokolovTravelOverrides(
  rawItem: RawItemWithSource,
  normalized: Omit<NormalizedDraft, "scores">,
): Omit<NormalizedDraft, "scores"> {
  if (!matchesSourceName(rawItem.source, /sokolov/i)) return normalized;
  const text = normalizeText(decodeHtmlEntities(rawItem.rawText ?? ""));
  if (!/вело|mtb|bike|дагестан|крым|абхаз|абхзи/i.test(text)) return normalized;

  const base = {
    ...normalized,
    eventType: normalized.eventType ?? "trip",
    discipline: /mtb|горн/i.test(text) ? "MTB" : normalized.discipline ?? "велотуризм / bikepacking",
    organizerName: "Sokolov Travel",
    bookingUrl:
      normalized.bookingUrl && !/taplink\.cc\/sokolov\.travel/i.test(normalized.bookingUrl)
        ? normalized.bookingUrl
        : rawItem.sourceUrl ?? normalized.bookingUrl,
    parseVersion: "v1_rules_sokolov_travel",
  };

  if (/дагестан/i.test(text)) {
    return {
      ...base,
      title: "Sokolov Travel · МТБ-тур по Дагестану",
      country: "Russia",
      region: "Дагестан",
      city: "Дагестан",
      venue: "Горный Дагестан",
      level: /4\/5|подготовлен/i.test(text) ? "advanced" : base.level,
      extractedJson: {
        ...(typeof base.extractedJson === "object" && base.extractedJson && !Array.isArray(base.extractedJson) ? base.extractedJson : {}),
        sourceSpecificProfile: "sokolov_travel_dagestan",
        hasExplicitDateSignal: true,
      } as Prisma.InputJsonValue,
    };
  }

  if (/крым/i.test(text)) {
    return {
      ...base,
      title: "Sokolov Travel · Велотур в Крым",
      country: "Russia",
      region: "Крым",
      city: "Крым",
      venue: "Крым",
      extractedJson: {
        ...(typeof base.extractedJson === "object" && base.extractedJson && !Array.isArray(base.extractedJson) ? base.extractedJson : {}),
        sourceSpecificProfile: "sokolov_travel_crimea",
        hasExplicitDateSignal: true,
      } as Prisma.InputJsonValue,
    };
  }

  if (/абхаз|абхзи/i.test(text)) {
    return {
      ...base,
      title: "Sokolov Travel · Велотур в Абхазию",
      country: "Абхазия",
      region: "Абхазия",
      city: "Абхазия",
      venue: "Абхазия",
      extractedJson: {
        ...(typeof base.extractedJson === "object" && base.extractedJson && !Array.isArray(base.extractedJson) ? base.extractedJson : {}),
        sourceSpecificProfile: "sokolov_travel-abkhazia",
        hasExplicitDateSignal: true,
      } as Prisma.InputJsonValue,
    };
  }

  return base;
}

const KAMCHATKA_TITLE_BY_SLUG: Record<string, string> = {
  "a-week-at-the-edge-of-the-world": "Камчатка за неделю",
  "killer-whales-and-bears": "Косатки и медведи",
  "kosatki-avachinskogo-zaliva": "Тайны Авачинского залива",
  "osennyaya-kamchatka": "Осенняя Камчатка",
  "secrets-of-the-ocean": "Тайны океана и Авачинского залива",
  "sailing-kamchatka": "Ski&Sail тур на Камчатке",
  "ski-and-sail-kamchatka": "Ski&Sail тур на Камчатке",
  "ski-tur-v-antarktide": "Ски-тур в Антарктиде",
  "space-kamchatka": "Космическая Камчатка",
  "volcanic-horizons-of-tolbachik": "Вулканические горизонты Толбачика",
};

const KAMCHATKA_DISCIPLINE_BY_SLUG: Record<string, string> = {
  "a-week-at-the-edge-of-the-world": "Экспедиция",
  "killer-whales-and-bears": "Экспедиция / дикая природа",
  "kosatki-avachinskogo-zaliva": "Экспедиция / дикая природа",
  "osennyaya-kamchatka": "Экспедиция",
  "secrets-of-the-ocean": "Экспедиция / дикая природа",
  "sailing-kamchatka": "Фрирайд / яхтинг",
  "ski-and-sail-kamchatka": "Ски-тур / яхтинг",
  "ski-tur-v-antarktide": "Ски-тур / бэккантри",
  "space-kamchatka": "Экспедиция",
  "volcanic-horizons-of-tolbachik": "Экспедиция / трекинг",
};

const KAMCHATKA_EVENT_TYPE_BY_SLUG: Record<string, NonNullable<NormalizedDraft["eventType"]>> = {
  "a-week-at-the-edge-of-the-world": "expedition",
  "killer-whales-and-bears": "expedition",
  "kosatki-avachinskogo-zaliva": "expedition",
  "osennyaya-kamchatka": "expedition",
  "secrets-of-the-ocean": "expedition",
  "sailing-kamchatka": "trip",
  "ski-and-sail-kamchatka": "trip",
  "ski-tur-v-antarktide": "expedition",
  "space-kamchatka": "expedition",
  "volcanic-horizons-of-tolbachik": "expedition",
};

const KAMCHATKA_EXACT_LOCATION_BY_SLUG: Record<string, string> = {
  "a-week-at-the-edge-of-the-world": "Камчатка",
  "killer-whales-and-bears": "Авачинский залив",
  "kosatki-avachinskogo-zaliva": "Авачинский залив",
  "osennyaya-kamchatka": "Камчатка",
  "secrets-of-the-ocean": "Авачинский залив",
  "sailing-kamchatka": "Бухта Русская / Авачинский залив",
  "ski-and-sail-kamchatka": "Авачинский залив / Камчатка",
  "space-kamchatka": "Камчатка",
  "volcanic-horizons-of-tolbachik": "Толбачик",
};

const KAMCHATKA_DEFAULT_DURATION_DAYS_BY_SLUG: Record<string, number> = {
  "a-week-at-the-edge-of-the-world": 7,
  "sailing-kamchatka": 8,
  "ski-and-sail-kamchatka": 5,
};

const KAMCHATKA_DESCRIPTION_BY_SLUG: Record<string, string> = {
  "a-week-at-the-edge-of-the-world":
    "Недельная экспедиционная программа по Камчатке: природные локации, морские выходы, наблюдение за сивучами, китами и косатками по погоде и сопровождение команды организатора.",
  "killer-whales-and-bears":
    "Морская экспедиция по Камчатке с катамараном, каякингом, вулканическими локациями и наблюдением за косатками, медведями и природой Тихого океана.",
  "kosatki-avachinskogo-zaliva":
    "Исследовательско-приключенческая программа по Авачинскому заливу: морской маршрут, наблюдение за флорой и фауной, остановки в бухтах и сопровождение команды.",
  "osennyaya-kamchatka":
    "Осенняя программа по Камчатке с морским выходом, джип-маршрутами, вулканическими локациями и наблюдением за дикой природой в спокойном сезонном формате.",
  "secrets-of-the-ocean":
    "Морская экспедиция вдоль восточного побережья Камчатки: Авачинский залив, бухты, наблюдение за океаном и дикой природой, участие малой группы.",
  "sailing-kamchatka":
    "Фрирайд-путешествие на катамаране по Авачинскому заливу и бухте Русская: морские переходы, выходы на берег, катание на лыжах или сноуборде, каякинг по погоде и сопровождение команды организатора.",
  "ski-and-sail-kamchatka":
    "Ски-тур с проживанием на парусном катамаране: морские переходы, каякинг, наблюдение за сивучами и катание в районе Авачинского залива.",
  "ski-tur-v-antarktide":
    "Экспедиционный ски-тур в Антарктиде для подготовленных участников: удаленная локация, бэккантри-формат и участие только после уточнения условий с организатором.",
  "space-kamchatka":
    "Экспедиционная программа по Камчатке: океан, вулканы, Долина гейзеров, каякинг, восхождения и наблюдение за природой в сопровождении команды организатора.",
  "volcanic-horizons-of-tolbachik":
    "Трекинговая экспедиция к вулканам Плоский и Острый Толбачик: лавовые поля, Мертвый лес, вулканические маршруты и выезд к ключевым природным точкам Камчатки.",
};

const KAMCHATKA_ITINERARY_BY_SLUG: Record<string, string> = {
  "a-week-at-the-edge-of-the-world":
    "Маршрут на 7 дней. В программе: знакомство с природными локациями Камчатки, морские выходы по погоде, наблюдение за сивучами, китами и косатками, отдых в бухтах и сопровождение команды организатора.",
  "killer-whales-and-bears":
    "Маршрут на 10 дней. В программе: морское путешествие на катамаране, каякинг, вулканические локации, наблюдение за косатками и медведями по погоде, переходы и стоянки в бухтах.",
  "kosatki-avachinskogo-zaliva":
    "Маршрут по Авачинскому заливу. В программе: морской выход, наблюдение за флорой и фауной, остановки в бухтах, исследовательско-приключенческий формат для малой группы.",
  "osennyaya-kamchatka":
    "Осенняя программа на 7 дней. В программе: морской выход, джип-маршруты, вулканические и природные локации, наблюдение за дикой природой и сопровождение команды.",
  "secrets-of-the-ocean":
    "Маршрут на 10 дней вдоль восточного побережья Камчатки. В программе: Авачинский залив, остановки в бухтах, наблюдение за океаном и дикой природой, малый состав группы.",
  "sailing-kamchatka":
    "Программа рассчитана на 8 дней. На Камчатке заложено 6 полных дней, из них 4-5 дней группа проводит в бухте Русская. Организаторы выбирают погодное окно за неделю до старта: маршрут может включать морской трансфер на катамаране/катере и вертолетный трансфер минимум в одну сторону по погоде. На маршруте: фрирайд-выходы, спуски на лыжах или сноуборде, морские переходы, каякинг по погоде и посещение лежбища сивучей.",
  "ski-and-sail-kamchatka":
    "Программа рассчитана на 5 дней. В формате: проживание на парусном катамаране, морские переходы, каякинг, наблюдение за сивучами и катание в районе Авачинского залива. Точный план по дням зависит от погоды и подтверждается организатором.",
  "ski-tur-v-antarktide":
    "Экспедиционный маршрут. Точные даты, длительность, состав группы и требования к участникам оператор должен подтвердить по источнику перед передачей заявки организатору.",
  "space-kamchatka":
    "Маршрут на 9 дней. В программе: океан, каякинг, восхождения, вулканические локации, Долина гейзеров и наблюдение за природой по погоде и сезону.",
  "volcanic-horizons-of-tolbachik":
    "Маршрут на 8 дней. В программе: вулканы Плоский и Острый Толбачик, лавовые поля, Мертвый лес, трекинговые выходы и возможный вылет к Долине гейзеров по погоде и условиям организатора.",
};

const KAMCHATKA_INCLUSIONS_BY_SLUG: Record<string, string> = {
  "sailing-kamchatka": "Размещение, питание, трансферы и сопровождение по программе организатора; морские переходы и катание по погодному окну.",
  "ski-and-sail-kamchatka": "Проживание на катамаране, морские переходы и сопровождение по программе организатора; детали включенного уточняются перед заявкой.",
  default: "Базовая программа и сопровождение организатора. Детальный состав включенного оператор уточняет по источнику перед передачей заявки.",
};

const KAMCHATKA_LEVEL_BY_SLUG: Record<string, string> = {
  "a-week-at-the-edge-of-the-world": "all_levels",
  "killer-whales-and-bears": "all_levels",
  "kosatki-avachinskogo-zaliva": "all_levels",
  "osennyaya-kamchatka": "all_levels",
  "secrets-of-the-ocean": "all_levels",
  "sailing-kamchatka": "beginner",
  "ski-and-sail-kamchatka": "intermediate",
  "ski-tur-v-antarktide": "expert",
  "space-kamchatka": "intermediate",
  "volcanic-horizons-of-tolbachik": "intermediate",
};

function addUtcDays(date: Date, days: number): Date {
  const next = new Date(date.getTime());
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function getKamchatkaProgramSlug(url: string | null | undefined): string | null {
  const match = /\/programs\/([^/?#]+)/i.exec(url ?? "");
  return match?.[1]?.toLowerCase() ?? null;
}

function cleanKamchatkaProgramTitle(value: string | null | undefined): string {
  return normalizeText(
    decodeHtmlEntities(value)
      .replace(/^Kamchatka Freeride Community\s*·?\s*/i, "")
      .replace(/\s+Nearest date:.*$/i, "")
      .replace(/\s+Free places:.*$/i, "")
      .replace(/\s+Price:.*$/i, "")
      .replace(/\s+LEARN MORE.*$/i, ""),
  );
}

function extractKamchatkaNearestDate(rawItem: RawItemWithSource): Date | null {
  const rawPayload =
    typeof rawItem.rawPayloadJson === "object" &&
    rawItem.rawPayloadJson &&
    !Array.isArray(rawItem.rawPayloadJson)
      ? (rawItem.rawPayloadJson as Record<string, unknown>)
      : null;

  const nearestDateText = normalizeText(
    typeof rawPayload?.nearestDate === "string"
      ? rawPayload.nearestDate
      : /Ближайшая дата:\s*([0-9.]+)/i.exec(normalizeText(rawItem.rawText ?? ""))?.[1] ?? "",
  );

  return extractDates(nearestDateText, rawItem.publishedAt).startDate ?? null;
}

function extractKamchatkaDateRange(rawItem: RawItemWithSource): { startDate: Date | null; endDate: Date | null } {
  const rawPayload =
    typeof rawItem.rawPayloadJson === "object" &&
    rawItem.rawPayloadJson &&
    !Array.isArray(rawItem.rawPayloadJson)
      ? (rawItem.rawPayloadJson as Record<string, unknown>)
      : null;
  const dateRangeText = normalizeText(typeof rawPayload?.dateRange === "string" ? rawPayload.dateRange : "");
  if (!dateRangeText) return { startDate: null, endDate: null };
  return extractDates(dateRangeText, rawItem.publishedAt);
}

function inferKamchatkaDiscipline(slug: string | null, text: string): string {
  if (slug && KAMCHATKA_DISCIPLINE_BY_SLUG[slug]) return KAMCHATKA_DISCIPLINE_BY_SLUG[slug];
  if (/antarct|ski-tour|backcountry|ски-тур|бэккантри/i.test(text)) return "Ски-тур / бэккантри";
  if (/heli|хели/i.test(text)) return "Хели-ски / фрирайд";
  if (/snowmobile|снегоход/i.test(text)) return "Снегоходный фрирайд";
  if (/freeride|snowboard|ski|фрирайд|сноуборд|лыж/i.test(text)) return "Фрирайд";
  if (/orca|whale|bear|ocean|avacha|косат|кит|медвед|океан|авачин/i.test(text)) return "Экспедиция / дикая природа";
  if (/sailing|яхт|катамаран/i.test(text)) return "Яхтинг / экспедиция";
  if (/tolbachik|volcan|толбачик|вулкан/i.test(text)) return "Экспедиция / трекинг";
  return "Экспедиция";
}

function inferKamchatkaEventType(
  slug: string | null,
  discipline: string,
  text: string,
): NonNullable<NormalizedDraft["eventType"]> {
  if (slug && KAMCHATKA_EVENT_TYPE_BY_SLUG[slug]) return KAMCHATKA_EVENT_TYPE_BY_SLUG[slug];
  if (/school/i.test(text)) return "training";
  if (/sailing|freeride|яхтинг|фрирайд/i.test(discipline)) return "trip";
  return "expedition";
}

function applyKamchatkaFreerideCommunityOverrides(
  rawItem: RawItemWithSource,
  normalized: Omit<NormalizedDraft, "scores">,
): Omit<NormalizedDraft, "scores"> {
  if (!matchesSourceName(rawItem.source, /kamchatka freeride community/i)) return normalized;

  const sourceUrl = rawItem.sourceUrl ?? normalized.bookingUrl;
  const slug = getKamchatkaProgramSlug(sourceUrl);
  const cleanedTitle = cleanKamchatkaProgramTitle(rawItem.rawTitle ?? normalized.title ?? "");
  const title = slug && KAMCHATKA_TITLE_BY_SLUG[slug] ? KAMCHATKA_TITLE_BY_SLUG[slug] : cleanedTitle;
  const text = normalizeText(`${title} ${rawItem.rawText ?? ""}`).toLowerCase();
  const discipline = inferKamchatkaDiscipline(slug, text);
  const eventType = inferKamchatkaEventType(slug, discipline, text);
  const isAntarctica = /antarct/i.test(text) || slug === "ski-tur-v-antarktide";
  const region = isAntarctica ? "Антарктида" : "Камчатка";
  const country = isAntarctica ? "Антарктида" : "Russia";
  const payloadDateRange = extractKamchatkaDateRange(rawItem);
  const nearestDate = payloadDateRange.startDate ?? extractKamchatkaNearestDate(rawItem) ?? normalized.startDate;
  const defaultDurationDays = slug ? KAMCHATKA_DEFAULT_DURATION_DAYS_BY_SLUG[slug] ?? null : null;
  const exactLocation = isAntarctica
    ? "Антарктида"
    : firstNonEmpty(
        slug ? KAMCHATKA_EXACT_LOCATION_BY_SLUG[slug] ?? null : null,
        normalized.city,
        normalized.venue,
        region,
      );

  let endDate = payloadDateRange.endDate ?? normalized.endDate;
  if (nearestDate && endDate) {
    const inferredDuration = computeDurationDays(nearestDate, endDate);
    if (!inferredDuration || inferredDuration > 10 || endDate < nearestDate) {
      endDate = null;
    }
  }
  if (nearestDate && defaultDurationDays && !payloadDateRange.endDate) {
    endDate = addUtcDays(nearestDate, defaultDurationDays - 1);
  }
  if (nearestDate && !endDate) {
    endDate = nearestDate;
  }

  return {
    ...normalized,
    eventType,
    discipline,
    title,
    descriptionShort: slug && KAMCHATKA_DESCRIPTION_BY_SLUG[slug] ? KAMCHATKA_DESCRIPTION_BY_SLUG[slug] : normalized.descriptionShort,
    descriptionFull: slug && KAMCHATKA_ITINERARY_BY_SLUG[slug] ? KAMCHATKA_ITINERARY_BY_SLUG[slug] : normalized.descriptionFull,
    organizerName: "Kamchatka Freeride Community",
    country,
    region,
    city: exactLocation,
    venue: exactLocation,
    startDate: nearestDate,
    endDate,
    durationDays: computeDurationDays(nearestDate, endDate),
    level: slug && KAMCHATKA_LEVEL_BY_SLUG[slug] ? KAMCHATKA_LEVEL_BY_SLUG[slug] : normalized.level,
    priceFrom: normalized.priceFrom,
    currency: normalized.currency ?? "RUB",
    bookingUrl: sourceUrl,
    parseVersion: "v1_rules_kamchatka_freeride_community",
    extractedJson: {
      ...(typeof normalized.extractedJson === "object" && normalized.extractedJson && !Array.isArray(normalized.extractedJson)
        ? normalized.extractedJson
        : {}),
      sourceSpecificProfile: "allaboutkamchatka_program_grid",
      suggestedInclusions: slug ? KAMCHATKA_INCLUSIONS_BY_SLUG[slug] ?? KAMCHATKA_INCLUSIONS_BY_SLUG.default : KAMCHATKA_INCLUSIONS_BY_SLUG.default,
      hasExplicitDateSignal: true,
    } as Prisma.InputJsonValue,
  };
}

function expandKaifCampCollectedItems(source: Source, item: CollectedItem): CollectedItem[] {
  if (!/kaif/i.test(normalizeText(source.name))) return [item];
  const text = normalizeText(decodeHtmlEntities(`${item.rawTitle ?? ""} ${item.rawText ?? ""}`));
  if (!/вейксерф|wakesurf|кемп|кэмп|camp/i.test(text)) return [item];

  const ranges = extractMultipleNumericDateRanges(text, item.publishedAt ?? null).filter((range) => (daysFromToday(range.endDate) ?? -1) >= 0);
  if (!ranges.length) return [item];

  const baseExternalId = item.externalItemId ?? item.sourceUrl ?? makeHash(item.rawTitle, item.rawText, source.name);
  return ranges.map((range, index) => ({
    ...item,
    externalItemId: `${baseExternalId}#slot-${range.startDate.toISOString().slice(0, 10)}`,
    rawTitle: `Kaif Camp · Мармарис · ${range.label}`,
    rawText: truncate(
      normalizeText(
        [
          "Весенний wakesurf-кэмп Kaif Camp в Мармарисе.",
          `Даты: ${range.label}.`,
          "Локация: Turkey Marmaris.",
          "Формат: wakesurf camp.",
          "Бронирование и подробности по ссылке на пост.",
          item.sourceUrl ?? null,
        ]
          .filter(Boolean)
          .join(" "),
      ),
      2200,
    ),
    rawPayload:
      item.rawPayload && typeof item.rawPayload === "object" && !Array.isArray(item.rawPayload)
        ? {
            ...item.rawPayload,
            sourceSpecificSplit: "kaif_camp_slots",
            slotIndex: index + 1,
            slotLabel: range.label,
          }
        : {
            sourceSpecificSplit: "kaif_camp_slots",
            slotIndex: index + 1,
            slotLabel: range.label,
          },
  }));
}

function expandKitePiterCollectedItems(source: Source, item: CollectedItem): CollectedItem[] {
  if (!/kitepiter/i.test(normalizeText(source.name))) return [item];
  const text = normalizeText(decodeHtmlEntities(`${item.rawTitle ?? ""} ${item.rawText ?? ""}`));
  if (/детск.*лагер/i.test(text)) {
    const ranges = getKitePiterChildrenCampSchedule().filter((range) => (daysFromToday(range.endDate) ?? -1) >= 0);
    if (!ranges.length) return [item];

    const baseExternalId = item.externalItemId ?? item.sourceUrl ?? makeHash(item.rawTitle, item.rawText, source.name);
    return ranges.map((range, index) => ({
      ...item,
      externalItemId: `${baseExternalId}#slot-${range.startDate.toISOString().slice(0, 10)}`,
      rawTitle: `KitePiter · Детский лагерь в СПб · ${range.label}`,
      rawText: truncate(
        normalizeText(
          [
            "Детский кайт-лагерь KitePiter в Санкт-Петербурге.",
            `Даты: ${range.label}.`,
            "Формат: 5 дней, понедельник–пятница.",
            "Расписание: последняя неделя июня, четыре недели июля и первые две недели августа.",
            "Локация: Санкт-Петербург.",
            "Стоимость: от 44 000 ₽.",
            item.sourceUrl ?? null,
          ]
            .filter(Boolean)
            .join(" "),
        ),
        2200,
      ),
      rawPayload:
        item.rawPayload && typeof item.rawPayload === "object" && !Array.isArray(item.rawPayload)
          ? {
              ...item.rawPayload,
              sourceSpecificSplit: "kitepiter_children_camp_slots",
              slotIndex: index + 1,
              slotLabel: range.label,
            }
          : {
              sourceSpecificSplit: "kitepiter_children_camp_slots",
              slotIndex: index + 1,
              slotLabel: range.label,
            },
    }));
  }

  if (!/кайт\s*сафари|кайтсафари/i.test(text) || !/египт|красн.*мор/i.test(text)) return [item];

  const ranges = extractSharedMonthDateRanges(text, item.publishedAt ?? null).filter((range) => (daysFromToday(range.endDate) ?? -1) >= 0);
  if (!ranges.length) return [item];

  const baseExternalId = item.externalItemId ?? item.sourceUrl ?? makeHash(item.rawTitle, item.rawText, source.name);
  return ranges.map((range, index) => ({
    ...item,
    externalItemId: `${baseExternalId}#safari-${range.startDate.toISOString().slice(0, 10)}`,
    rawTitle: `KitePiter · кайт-сафари · Египет · ${range.label}`,
    rawText: truncate(
      normalizeText(
        [
          "Кайт-сафари KitePiter в Египте.",
          `Даты: ${range.label}.`,
          "Локация: Египет, Красное море.",
          "Формат: недельный выезд на кайт-сафари.",
          item.sourceUrl ?? null,
        ]
          .filter(Boolean)
          .join(" "),
      ),
      2200,
    ),
    rawPayload:
      item.rawPayload && typeof item.rawPayload === "object" && !Array.isArray(item.rawPayload)
        ? {
            ...item.rawPayload,
            sourceSpecificSplit: "kitepiter_safari_slots",
            slotIndex: index + 1,
            slotLabel: range.label,
          }
        : {
            sourceSpecificSplit: "kitepiter_safari_slots",
            slotIndex: index + 1,
            slotLabel: range.label,
          },
  }));
}

function expandOffysCollectedItems(source: Source, item: CollectedItem): CollectedItem[] {
  if (!/offys/i.test(normalizeText(source.name))) return [item];
  const text = normalizeText(decodeHtmlEntities(`${item.rawTitle ?? ""} ${item.rawText ?? ""}`));
  if (!/кемп|кемпы|camp|дагестан/i.test(text)) return [item];

  const ranges = extractOffysDateRanges(text, item.publishedAt ?? null).filter(
    (range) => !range.soldOut && (daysFromToday(range.endDate) ?? -1) >= 0,
  );
  if (!ranges.length) return [item];

  const locationLabel = ranges[0]?.locationLabel ?? (/дагестан|сулак/i.test(text) ? "Дагестан" : "Краснодар");
  const baseExternalId = item.externalItemId ?? item.sourceUrl ?? makeHash(item.rawTitle, item.rawText, source.name);
  return ranges.map((range, index) => ({
    ...item,
    externalItemId: `${baseExternalId}#slot-${range.startDate.toISOString().slice(0, 10)}`,
    rawTitle: `Offys Camp · ${locationLabel} · ${range.label}`,
    rawText: truncate(
      normalizeText(
        [
          `Wakesurf-кэмп Offys Wakesurf.`,
          `Даты: ${range.label}.`,
          `Локация: ${locationLabel}.`,
          locationLabel === "Дагестан"
            ? "Формат: 6 дней, катание с тренером, питание, трансферы и экскурсия."
            : "Формат: 7 дней и 6 ночей, катание с тренером, питание, баня и трансферы.",
          item.sourceUrl ?? null,
        ]
          .filter(Boolean)
          .join(" "),
      ),
      2200,
    ),
    rawPayload:
      item.rawPayload && typeof item.rawPayload === "object" && !Array.isArray(item.rawPayload)
        ? {
            ...item.rawPayload,
            sourceSpecificSplit: "offys_slots",
            slotIndex: index + 1,
            slotLabel: range.label,
            slotLocation: locationLabel,
          }
        : {
            sourceSpecificSplit: "offys_slots",
            slotIndex: index + 1,
            slotLabel: range.label,
            slotLocation: locationLabel,
          },
  }));
}

function expandTalkToFishCollectedItems(source: Source, item: CollectedItem): CollectedItem[] {
  if (!/talk\s*to\s*fish|kristina\s+kolesnikova/i.test(normalizeText(source.name))) return [item];
  const text = normalizeText(decodeHtmlEntities(`${item.rawTitle ?? ""} ${item.rawText ?? ""}`));
  if (!/зимние\s+к[эе]мпы|сохраняем\s+даты/i.test(text)) return [item];

  const baseYear = item.publishedAt?.getUTCFullYear() ?? new Date().getUTCFullYear();
  const slots = [
    {
      location: "Бангкок",
      country: "Thailand",
      city: "Бангкок",
      startDate: toMiddayDate(baseYear, 11, 22),
      endDate: toMiddayDate(baseYear, 11, 29),
      theme: "Новая локация: катание, природа, сухие тренировки и спокойный travel-формат.",
    },
    {
      location: "Бангкок",
      country: "Thailand",
      city: "Бангкок",
      startDate: toMiddayDate(baseYear, 12, 25),
      endDate: toMiddayDate(baseYear + 1, 1, 15),
      theme: "Новогодний формат с катанием, поездкой на море и активным отдыхом.",
    },
    {
      location: "Куала-Лумпур",
      country: "Malaysia",
      city: "Куала-Лумпур",
      startDate: toMiddayDate(baseYear + 1, 2, 23),
      endDate: toMiddayDate(baseYear + 1, 3, 4),
      theme: "Формат для тех, кто хочет совместить катание и первое знакомство с Малайзией.",
    },
    {
      location: "Гонконг",
      country: "Hong Kong",
      city: "Гонконг",
      startDate: toMiddayDate(baseYear + 1, 3, 17),
      endDate: toMiddayDate(baseYear + 1, 3, 25),
      theme: "Насыщенная поездка с упором на изучение Гонконга и катание на море.",
    },
    {
      location: "Япония",
      country: "Japan",
      city: "Япония",
      startDate: toMiddayDate(baseYear + 1, 5, 1),
      endDate: toMiddayDate(baseYear + 1, 5, 10),
      theme: "Исследование Японии, катание, отдых и travel-программа по окрестностям.",
    },
  ].filter((slot) => (daysFromToday(slot.endDate) ?? -1) >= 0);

  if (!slots.length) return [item];

  const baseExternalId = item.externalItemId ?? item.sourceUrl ?? makeHash(item.rawTitle, item.rawText, source.name);
  return slots.map((slot, index) => {
    const label = formatDateRangeLabel(slot.startDate, slot.endDate);
    return {
      ...item,
      externalItemId: `${baseExternalId}#winter-camp-${slot.startDate.toISOString().slice(0, 10)}`,
      rawTitle: `Talk to Fish · вейксерф-кэмп · ${slot.location} · ${label}`,
      rawText: truncate(
        normalizeText(
          [
            "Вейксерф-кэмп Talk to Fish / Кристины Колесниковой.",
            `Локация: ${slot.location}.`,
            `Даты: ${label}.`,
            slot.theme,
            "Формат: wakesurf camp + travel.",
            "Запись и подробности через Telegram.",
            item.sourceUrl ?? "https://t.me/talktofish",
          ]
            .filter(Boolean)
            .join(" "),
        ),
        2200,
      ),
      rawPayload:
        item.rawPayload && typeof item.rawPayload === "object" && !Array.isArray(item.rawPayload)
          ? {
              ...item.rawPayload,
              sourceSpecificSplit: "talktofish_winter_camp_slots",
              slotIndex: index + 1,
              slotLabel: label,
              slotLocation: slot.location,
              slotCountry: slot.country,
              slotCity: slot.city,
              slotTheme: slot.theme,
            }
          : {
              sourceSpecificSplit: "talktofish_winter_camp_slots",
              slotIndex: index + 1,
              slotLabel: label,
              slotLocation: slot.location,
              slotCountry: slot.country,
              slotCity: slot.city,
              slotTheme: slot.theme,
            },
    };
  });
}

function expandCollectedItemsForSource(source: Source, item: CollectedItem): CollectedItem[] {
  return expandKitePiterCollectedItems(source, item).flatMap((kitePiterExpandedItem) =>
    expandKaifCampCollectedItems(source, kitePiterExpandedItem).flatMap((expandedItem) =>
      expandOffysCollectedItems(source, expandedItem).flatMap((offysExpandedItem) => expandTalkToFishCollectedItems(source, offysExpandedItem)),
    ),
  );
}

function scoreNormalizedItem(source: SourceWithOrganizer, normalized: Omit<NormalizedDraft, "scores">): ScoreBundle {
  const text = normalizeText(`${normalized.title ?? ""} ${normalized.descriptionFull ?? ""}`.toLowerCase());
  const eventKeywordHits = Object.values(EVENT_TYPE_KEYWORDS).flat().filter((keyword) => text.includes(keyword)).length;
  const eventLikelihoodScore = clampScore(0.18 + eventKeywordHits * 0.17 + (normalized.startDate ? 0.25 : 0) + (normalized.bookingUrl ? 0.1 : 0));

  const daysToStart = daysFromToday(normalized.startDate);
  const daysToEnd = daysFromToday(normalized.endDate ?? normalized.startDate);
  const hasExplicitDate = getExtractedJsonFlag(normalized.extractedJson, "hasExplicitDateSignal");
  const futureEventScore =
    daysToEnd == null
      ? 0.08
      : !hasExplicitDate
        ? 0.08
        : daysToEnd < 0
          ? 0
          : daysToStart != null && daysToStart < 0
            ? 0.92
            : daysToStart != null && daysToStart <= 7
              ? 1
              : daysToStart != null && daysToStart <= 45
                ? 0.82
                : 0.55;

  const completenessFields = [
    normalized.eventType,
    normalized.discipline,
    normalized.title,
    normalized.startDate ? "date" : null,
    normalized.region,
    normalized.organizerName,
    normalized.bookingUrl,
    normalized.imageUrl,
    normalized.level,
    normalized.priceFrom != null ? "price" : null,
  ].filter(Boolean).length;
  const completenessScore = clampScore(completenessFields / 10);
  const sourceTrustScore = clampScore(source.trustScore);

  if (isLikelyStatsOrClimateInfographicPostText(text)) {
    return buildOffTopicScoutingBundle({
      eventLikelihoodScore,
      futureEventScore,
      completenessScore,
      sourceTrustScore,
    });
  }

  const sportMentionedInPost = disciplineMentionedInPostText(text);
  const formatIntent = Boolean(normalized.eventType) || hasPilotProgramFormatIntent(text);
  const sourceDisciplinePrior = Boolean(getPrimarySourceDiscipline(source));
  const disciplineTourism = sportMentionedInPost ? 0.24 : sourceDisciplinePrior ? 0.08 : 0;
  const eventTourism = formatIntent ? 0.18 : 0;
  const tourismFitScore = clampScore(
    0.12 + disciplineTourism + eventTourism + (normalized.startDate ? 0.12 : 0) + (normalized.region ? 0.1 : 0) + (normalized.bookingUrl ? 0.08 : 0),
  );
  const duplicateScore = 0;
  const trustScore = sourceTrustScore;
  const fitScore = tourismFitScore;
  const finalScore = clampScore(
    eventLikelihoodScore * 0.28 +
      futureEventScore * 0.24 +
      completenessScore * 0.18 +
      sourceTrustScore * 0.18 +
      tourismFitScore * 0.12,
  );
  const confidenceScore = clampScore((completenessScore + eventLikelihoodScore + futureEventScore) / 3);
  const reviewPriority = Math.round(finalScore * 100);
  const routedStatus: EventCandidateStatus =
    finalScore >= 0.42 && futureEventScore >= 0.2 && eventLikelihoodScore >= 0.3 ? "needs_review" : "archived";

  return {
    confidenceScore,
    eventLikelihoodScore,
    futureEventScore,
    completenessScore,
    sourceTrustScore,
    tourismFitScore,
    trustScore,
    fitScore,
    duplicateScore,
    finalScore,
    reviewPriority,
    routedStatus,
  };
}

function buildNormalizedDraft(rawItem: RawItemWithSource): NormalizedDraft {
  const rawTitle = normalizeText(decodeHtmlEntities(rawItem.rawTitle ?? ""));
  const rawText = normalizeText(decodeHtmlEntities(rawItem.rawText ?? ""));
  const imageUrl = extractImageUrl(rawItem.rawMediaJson, `${JSON.stringify(rawItem.rawMediaJson ?? [])} ${rawText}`);
  const ocrText = extractOcrTextFromImage(rawItem.source, imageUrl, rawText);
  const combined = normalizeText(`${rawTitle ?? ""}\n${rawText ?? ""}\n${ocrText ?? ""}`);
  const lower = combined.toLowerCase();
  const extractedDates = extractDates(lower, rawItem.publishedAt);
  const region = detectRegion(lower, rawItem.source);
  const eventType = detectEventType(lower);
  const discipline = detectDiscipline(lower, rawItem.source);
  const level = detectLevel(lower);
  const price = extractPrice(lower);
  const urls = extractUrls(rawText);
  const bookingUrl = urls.find((url) => !rawItem.sourceUrl || url !== rawItem.sourceUrl) ?? rawItem.sourceUrl ?? null;
  const organizerName = firstNonEmpty(rawItem.source.organizer?.displayName, rawItem.authorName, rawItem.source.name);
  const derivedTitle = looksLikeGenericRawTitle(rawTitle, rawItem.source) ? deriveTitleFromText(rawText) : null;
  const title = firstNonEmpty(derivedTitle, rawTitle, truncate(rawText, 120));
  const descriptionShort = truncate(rawText, 220);
  const descriptionFull = rawText || rawTitle;
  const durationDays = computeDurationDays(extractedDates.startDate, extractedDates.endDate);
  const explicitDateSignal = hasExplicitDateSignal(lower);
  const normalizedBase: Omit<NormalizedDraft, "scores"> = {
    eventType,
    discipline,
    title,
    descriptionShort,
    descriptionFull,
    country: region.country,
    region: region.region,
    city: region.city,
    venue: null,
    startDate: extractedDates.startDate,
    endDate: extractedDates.endDate,
    durationDays,
    level,
    priceFrom: price.priceFrom,
    currency: price.currency,
    organizerName,
    bookingUrl,
    imageUrl,
    confidenceScore: 0,
    parseVersion: "v1_rules",
    extractedJson: {
      sourceType: rawItem.source.type,
      extractedUrls: urls.slice(0, 5),
      rawPublishedAt: rawItem.publishedAt?.toISOString() ?? null,
      hasExplicitDateSignal: explicitDateSignal,
      ocrTextPreview: truncate(ocrText, 180),
    },
  };
  const normalizedWithWakeStyle = applyWakeStyleClubOverrides(rawItem, normalizedBase);
  const normalizedWithWhitePeaks = applyWhitePeaksOverrides(rawItem, normalizedWithWakeStyle);
  const normalizedWithSaratov = applySaratovSurfCampOverrides(rawItem, normalizedWithWhitePeaks);
  const normalizedWithFreeride = applyFreerideRussiaOverrides(rawItem, normalizedWithSaratov);
  const normalizedWithQuiksilver = applyQuiksilverKamchatkaOverrides(rawItem, normalizedWithFreeride);
  const normalizedWithWakeHouse = applyWakeHouseOverrides(rawItem, normalizedWithQuiksilver);
  const normalizedWithOffys = applyOffysOverrides(rawItem, normalizedWithWakeHouse);
  const normalizedWithBonus = applyBonusSummerCampOverrides(rawItem, normalizedWithOffys);
  const normalizedWithRiverSurf = applyRiverSurfOverrides(rawItem, normalizedWithBonus);
  const normalizedWithMouseBikeHouse = applyMouseBikeHouseOverrides(rawItem, normalizedWithRiverSurf);
  const normalizedWithKaif = applyKaifCampOverrides(rawItem, normalizedWithMouseBikeHouse);
  const normalizedWithKitePiter = applyKitePiterOverrides(rawItem, normalizedWithKaif);
  const normalizedWithTeamSergeev = applyTeamSergeevTelegramOverrides(rawItem, normalizedWithKitePiter);
  const normalizedWithTalkToFish = applyTalkToFishOverrides(rawItem, normalizedWithTeamSergeev);
  const normalizedWithSokolov = applySokolovTravelOverrides(rawItem, normalizedWithTalkToFish);
  const normalizedWithOverrides = applyKamchatkaFreerideCommunityOverrides(rawItem, normalizedWithSokolov);
  const scores = scoreNormalizedItem(rawItem.source, normalizedWithOverrides);
  return {
    ...normalizedWithOverrides,
    confidenceScore: scores.confidenceScore,
    scores,
  };
}

function buildCandidateGroupKey(candidate: CandidateWithRelations): string {
  const n = candidate.normalizedItem;
  const titleFingerprint = normalizeText(n.title ?? "").toLowerCase().replace(/[^a-zа-я0-9]+/gi, "-").slice(0, 36) || "untitled";
  const organizer = normalizeText(n.organizerName ?? "").toLowerCase().replace(/[^a-zа-я0-9]+/gi, "-").slice(0, 24) || "unknown-organizer";
  const region = normalizeText(n.region ?? n.city ?? "").toLowerCase().replace(/[^a-zа-я0-9]+/gi, "-").slice(0, 18) || "unknown-region";
  const datePart = n.startDate ? n.startDate.toISOString().slice(0, 10) : "no-date";
  const discipline = normalizeText(n.discipline ?? "").toLowerCase().replace(/[^a-zа-я0-9]+/gi, "-") || "unknown-discipline";
  return [discipline, organizer, region, datePart, titleFingerprint].join("|");
}

function sourceRank(sourceType: string): number {
  return SOURCE_PRIORITY_RANK[sourceType as SourceType] ?? 10;
}

function createDraftProgramPayload(candidate: CandidateWithRelations, organizerId: string): Prisma.ProgramCreateInput {
  const normalized = candidate.normalizedItem;
  const raw = normalized.rawItem;
  const src = raw.source;
  const startDate = normalized.startDate ?? new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);
  const endDate = normalized.endDate ?? normalized.startDate ?? startDate;
  const organizerName = normalized.organizerName ?? src.name;
  const extractedJson =
    typeof normalized.extractedJson === "object" && normalized.extractedJson && !Array.isArray(normalized.extractedJson)
      ? (normalized.extractedJson as Record<string, unknown>)
      : {};
  const suggestedInclusions = typeof extractedJson.suggestedInclusions === "string" ? extractedJson.suggestedInclusions.trim() : "";
  const now = new Date();
  const sourceUrl = firstNonEmpty(raw.sourceUrl, src.urlOrHandle, null);

  return {
    organizer: { connect: { id: organizerId } },
    source: { connect: { id: src.id } },
    sourceType: src.type,
    sourceUrl: sourceUrl ?? undefined,
    ingestedAt: now,
    reviewStatus: "auto_pending",
    autoPublished: true,
    title: normalized.title ?? `${organizerName} — программа`,
    discipline: normalized.discipline ?? src.discipline ?? "Unknown",
    region: normalized.region ?? normalized.country ?? src.region ?? "Unknown",
    exactLocation: firstNonEmpty(normalized.city, normalized.venue),
    startDate,
    endDate,
    durationDays: normalized.durationDays ?? computeDurationDays(startDate, endDate) ?? 1,
    formatType: normalized.eventType ?? "camp",
    audienceFit: normalized.descriptionShort ?? normalized.descriptionFull ?? "Требует ручной нормализации оператором.",
    levelRequired: normalized.level ?? "all_levels",
    riskLevel: "medium",
    priceFromRub: normalized.currency === "RUB" ? normalized.priceFrom : null,
    currency: normalized.currency ?? "RUB",
    inclusions: suggestedInclusions || "Базовая программа и сопровождение организатора. Детальный состав включенного оператор уточняет по источнику перед передачей заявки.",
    exclusions: null,
    gearRequirements: "Требует ручного заполнения оператором.",
    medicalLimitations: "",
    itineraryDayByDay: normalized.descriptionFull ?? "Требует ручного заполнения оператором.",
    organizerName,
    cancellationRules: "Требует ручного заполнения оператором.",
    whatHappensAfterBooking: "После заявки оператор уточняет детали и переводит в следующий шаг.",
    cta: normalized.bookingUrl,
    intakeSource: "ingestion_auto",
    publishStatus: "draft",
  };
}

function buildAutopilotMergeUpdate(
  programPayload: Prisma.ProgramCreateInput,
  source: Source,
  raw: RawItem,
  existing: { id: string; ingestedAt: Date | null },
): Prisma.ProgramUpdateInput {
  const now = new Date();
  const sourceUrl = firstNonEmpty(raw.sourceUrl, source.urlOrHandle, null);
  return {
    title: programPayload.title as string,
    discipline: programPayload.discipline as string,
    region: programPayload.region as string,
    exactLocation: (programPayload.exactLocation as string | null | undefined) ?? null,
    startDate: programPayload.startDate as Date,
    endDate: programPayload.endDate as Date,
    durationDays: programPayload.durationDays as number,
    formatType: (programPayload.formatType as string | null | undefined) ?? undefined,
    audienceFit: (programPayload.audienceFit as string | null | undefined) ?? undefined,
    levelRequired: (programPayload.levelRequired as string | null | undefined) ?? undefined,
    riskLevel: (programPayload.riskLevel as string | null | undefined) ?? undefined,
    priceFromRub: (programPayload.priceFromRub as number | null | undefined) ?? null,
    currency: (programPayload.currency as string | null | undefined) ?? undefined,
    inclusions: (programPayload.inclusions as string | null | undefined) ?? undefined,
    exclusions: (programPayload.exclusions as string | null | undefined) ?? null,
    gearRequirements: (programPayload.gearRequirements as string | null | undefined) ?? undefined,
    medicalLimitations: (programPayload.medicalLimitations as string | null | undefined) ?? undefined,
    itineraryDayByDay: (programPayload.itineraryDayByDay as string | null | undefined) ?? undefined,
    organizerName: (programPayload.organizerName as string | null | undefined) ?? undefined,
    cancellationRules: (programPayload.cancellationRules as string | null | undefined) ?? undefined,
    whatHappensAfterBooking: (programPayload.whatHappensAfterBooking as string | null | undefined) ?? undefined,
    cta: (programPayload.cta as string | null | undefined) ?? undefined,
    source: { connect: { id: source.id } },
    sourceType: source.type,
    sourceUrl: sourceUrl ?? undefined,
    ingestedAt: existing.ingestedAt ?? now,
    updatedFromSourceAt: now,
    reviewStatus: "auto_pending",
    autoPublished: true,
    intakeSource: "ingestion_auto",
  };
}

function buildProgramDedupProbe(payload: Prisma.ProgramCreateInput, organizerId: string): ProgramDedupShape {
  const startDate = payload.startDate instanceof Date ? payload.startDate : new Date(payload.startDate as string);
  const endDate = payload.endDate instanceof Date ? payload.endDate : new Date(payload.endDate as string);
  return {
    id: "__candidate__",
    title: String(payload.title),
    discipline: String(payload.discipline),
    region: String(payload.region),
    exactLocation: typeof payload.exactLocation === "string" ? payload.exactLocation : null,
    startDate,
    endDate,
    organizerId,
    organizerName: typeof payload.organizerName === "string" ? payload.organizerName : null,
    priceFromRub: typeof payload.priceFromRub === "number" ? payload.priceFromRub : null,
    capacityTotal: typeof payload.capacityTotal === "number" ? payload.capacityTotal : null,
    spotsAvailable: typeof payload.spotsAvailable === "number" ? payload.spotsAvailable : null,
    isStarred: typeof payload.isStarred === "boolean" ? payload.isStarred : false,
  };
}

async function findExistingPublishedProgramDuplicate(
  tx: Prisma.TransactionClient,
  probe: ProgramDedupShape,
) {
  const candidateKey = buildProgramDedupKey(probe);
  const possible = await tx.program.findMany({
    where: {
      publishStatus: { in: ["draft", "internal_review", "needs_fix", "approved", "published"] },
      startDate: probe.startDate,
      endDate: probe.endDate,
      discipline: { equals: probe.discipline, mode: "insensitive" },
      region: { equals: probe.region, mode: "insensitive" },
    },
    include: {
      media: true,
      publishedPrograms: true,
    },
  });

  const matches = possible.filter((program) => (
    program.publishedPrograms.length > 0 && buildProgramDedupKey(program) === candidateKey
  ));
  if (!matches.length) return null;

  return matches.reduce((best, program) => pickPreferredProgram(best, program), matches[0]);
}

function parseFeedItemBlock(block: string, tag: string): string | null {
  const direct = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i").exec(block)?.[1];
  if (direct) return normalizeText(direct);
  return null;
}

function parseAttr(block: string, attr: string): string | null {
  return new RegExp(`${attr}="([^"]+)"`, "i").exec(block)?.[1] ?? null;
}

function normalizeHost(value: string): string {
  return value.replace(/^www\./i, "").toLowerCase();
}

function resolveUrl(value: string, baseUrl: string): string | null {
  try {
    const url = new URL(value, baseUrl);
    if (!/^https?:$/i.test(url.protocol)) return null;
    return url.toString();
  } catch {
    return null;
  }
}

function stripHtmlToText(value: string): string {
  return normalizeText(
    value
      .replace(/<script\b[\s\S]*?<\/script>/gi, " ")
      .replace(/<style\b[\s\S]*?<\/style>/gi, " ")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/(p|div|li|section|article|h1|h2|h3|h4|h5|h6|tr|td)>/gi, "\n")
      .replace(/<[^>]+>/g, " "),
  );
}

function isUtilityUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    const host = normalizeHost(parsed.hostname);
    const path = parsed.pathname.toLowerCase();
    if (["instagram.com", "t.me", "vk.com", "youtube.com", "youtu.be", "facebook.com", "telemetr.io"].some((item) => host === item || host.endsWith(`.${item}`))) {
      return true;
    }
    if (
      /(^|\/)(contact|contacts|about|aboutus|team|staff|company|companies|o-nas|o-kompanii|komanda)(\/|$)/i.test(path) ||
      /(^|\/)(tel:|mailto:)/i.test(path)
    ) {
      return true;
    }
    return /\.(jpg|jpeg|png|webp|svg|gif|pdf)$/i.test(parsed.pathname);
  } catch {
    return true;
  }
}

function extractContextImageUrl(block: string, pageUrl: string): string | null {
  const raw =
    /<img[^>]*src="([^"]+)"/i.exec(block)?.[1] ??
    /<source[^>]*srcset="([^"]+)"/i.exec(block)?.[1]?.split(",")[0]?.trim().split(/\s+/)[0] ??
    /background-image:\s*url\(['"]?([^'")]+)['"]?\)/i.exec(block)?.[1] ??
    null;
  return raw ? resolveUrl(raw, pageUrl) : null;
}

function hasEventSignals(text: string, href: string | null = null): boolean {
  const lower = normalizeText(text).toLowerCase();
  if (!lower || lower.length < 12) return false;
  const keywordBank = [
    ...Object.values(EVENT_TYPE_KEYWORDS).flat(),
    "расписан",
    "schedule",
    "calendar",
    "календар",
    "программа",
    "тур",
    "выезд",
    "сбор",
    "школа",
    "лагерь",
    "кемп",
    "кэмп",
    "camp",
    "clinic",
    "trip",
    "expedition",
    "2026",
    "2027",
  ];
  if (keywordBank.some((keyword) => lower.includes(keyword))) return true;
  if (/(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})/.test(lower)) return true;
  if (/(\d{1,2})(?:\s*(?:-|–|—)\s*(\d{1,2}))?\s+(января|февраля|марта|апреля|мая|июня|июля|августа|сентября|октября|ноября|декабря|january|february|march|april|may|june|july|august|september|october|november|december)/i.test(lower)) {
    return true;
  }
  return !!href && /(calendar|raspis|schedule|camp|clinic|trip|tour|event|program|programma|tours|travel)/i.test(href);
}

function parseCalendarGridItems(source: Source, html: string, pageUrl: string): CollectedItem[] {
  if (!/calendar__tr/i.test(html)) return [];
  const sectionStart = html.search(/<div class="calendar">/i);
  const sectionEnd = html.search(/<a href="#requestCall"/i);
  const section =
    sectionStart >= 0
      ? html.slice(sectionStart, sectionEnd > sectionStart ? sectionEnd : undefined)
      : html;

  const chunks = section.split(/<div class="calendar__tr"[^>]*>/i).slice(1);
  const items: CollectedItem[] = [];
  const pageImage =
    /<meta[^>]+property="og:image"[^>]+content="([^"]+)"/i.exec(html)?.[1] ??
    /<meta[^>]+name="twitter:image"[^>]+content="([^"]+)"/i.exec(html)?.[1] ??
    null;

  for (const chunk of chunks) {
    const href = /<a href="([^"]+)"(?:[^>]*)>(?:[\s\S]*?)<\/a>/i.exec(chunk)?.[1] ?? /<a href="([^"]+)" class="calendar__link"/i.exec(chunk)?.[1];
    const resolved = href ? resolveUrl(href, pageUrl) : null;
    if (!resolved || isUtilityUrl(resolved)) continue;

    const title =
      /<div class="calendar__td calendar__name">[\s\S]*?<a href="[^"]+">([\s\S]*?)<\/a>/i.exec(chunk)?.[1] ??
      /<div class="calendar__td calendar__name">([\s\S]*?)<\/div>/i.exec(chunk)?.[1] ??
      null;
    const dates =
      /<span class="calendar__prop-title">\s*Даты:\s*<\/span>\s*<span class="calendar__prop-value">\s*([\s\S]*?)\s*<\/span>/i.exec(chunk)?.[1] ??
      null;
    const duration =
      /<span class="calendar__prop-title">\s*Длительность:\s*<\/span>\s*<span class="calendar__prop-value">\s*([\s\S]*?)\s*<\/span>/i.exec(chunk)?.[1] ??
      null;
    const price =
      /<span class="calendar__prop-title">\s*Цена:\s*<\/span>\s*<span class="calendar__prop-value">\s*([\s\S]*?)\s*<\/span>/i.exec(chunk)?.[1] ??
      null;
    const image =
      /<img[^>]*src="([^"]+)"/i.exec(chunk)?.[1] ??
      pageImage;

    const normalizedTitle = normalizeText(title);
    const rawText = normalizeText(
      [
        normalizedTitle,
        dates ? `Даты: ${stripHtmlToText(dates)}` : null,
        duration ? `Длительность: ${stripHtmlToText(duration)}` : null,
        price ? `Цена: ${stripHtmlToText(price)}` : null,
        resolved,
      ]
        .filter(Boolean)
        .join(". "),
    );
    if (!normalizedTitle || !hasEventSignals(rawText, resolved)) continue;

    items.push({
      externalItemId: resolved,
      sourceUrl: resolved,
      authorName: source.name,
      rawTitle: truncate(normalizedTitle, 160),
      rawText: truncate(rawText, 1200),
      rawMedia: image ? [{ url: resolveUrl(image, pageUrl) ?? image }] : [],
      rawPayload: {
        discoveryUrl: pageUrl,
        mode: "calendar_grid",
      },
    });
  }

  return items;
}

function shouldUseAllAboutKamchatkaProgramGrid(source: Source, pageUrl: string): boolean {
  try {
    const url = new URL(pageUrl);
    return (
      /kamchatka freeride community/i.test(source.name) &&
      normalizeHost(url.hostname) === "allaboutkamchatka.ru" &&
      /\/en\/programs\//i.test(url.pathname)
    );
  } catch {
    return false;
  }
}

function isAllAboutKamchatkaProgramDetailPage(source: Source, pageUrl: string): boolean {
  try {
    const url = new URL(pageUrl);
    return (
      /kamchatka freeride community/i.test(source.name) &&
      normalizeHost(url.hostname) === "allaboutkamchatka.ru" &&
      /^\/(?:en\/)?programs\/[^/?#]+\/?$/i.test(url.pathname)
    );
  } catch {
    return false;
  }
}

function isKamchatkaFreerideProgramTitle(title: string): boolean {
  const normalized = normalizeText(title).toLowerCase();
  return /(freeride|heli|ski|snowboard|snowmobile|ski-tour|backcountry|sailing|sail|orca|whale|bear|kamchatka)/i.test(normalized);
}

function extractFirstAllAboutAvailability(html: string): { dateRange: string | null; seats: string | null } {
  const dateRange = /'DATE':'([^']+)'/i.exec(html)?.[1] ?? null;
  const seats = /'AVAILABLE_QUANTITY_FORMATED':'([^']+)'/i.exec(html)?.[1] ?? null;
  return { dateRange: dateRange ? decodeHtmlEntities(dateRange) : null, seats: seats ? decodeHtmlEntities(seats) : null };
}

function extractAllAboutHeaderText(html: string, className: string): string | null {
  const pattern = new RegExp(`<[^>]+class="${className}"[^>]*>([\\s\\S]*?)<\\/[^>]+>`, "i");
  return normalizeText(stripHtmlToText(pattern.exec(html)?.[1] ?? "")) || null;
}

function parseAllAboutKamchatkaProgramDetailItem(source: Source, html: string, pageUrl: string): CollectedItem[] {
  if (!isAllAboutKamchatkaProgramDetailPage(source, pageUrl)) return [];
  const slug = getKamchatkaProgramSlug(pageUrl);
  const title =
    (slug && KAMCHATKA_TITLE_BY_SLUG[slug]) ||
    extractAllAboutHeaderText(html, "program-header-h") ||
    stripHtmlToText(/<title>([\s\S]*?)<\/title>/i.exec(html)?.[1] ?? "");
  if (!title || !hasEventSignals(title, pageUrl)) return [];

  const subtitle = extractAllAboutHeaderText(html, "program-header-p");
  const metaDescription =
    decodeHtmlEntities(/<meta[^>]+name="description"[^>]+content="([^"]+)"/i.exec(html)?.[1] ?? "") ||
    decodeHtmlEntities(/<meta[^>]+property="og:description"[^>]+content="([^"]+)"/i.exec(html)?.[1] ?? "");
  const headerInfo = [...html.matchAll(/<div class="program-header-info-text">([\s\S]*?)<\/div>/gi)]
    .map((match) => stripHtmlToText(match[1]))
    .filter(Boolean);
  const priceText =
    stripHtmlToText(/<div class="program-sidebar-price">([\s\S]*?)<\/div>/i.exec(html)?.[1] ?? "") ||
    stripHtmlToText(/"price":"?([0-9]+)"?/i.exec(html)?.[1] ?? "");
  const availability = extractFirstAllAboutAvailability(html);
  const image =
    /<meta[^>]+property="og:image"[^>]+content="([^"]+)"/i.exec(html)?.[1] ??
    /program-header"[^>]+background-image:\s*url\('([^']+)'\)/i.exec(html)?.[1] ??
    null;
  const description =
    (slug && KAMCHATKA_DESCRIPTION_BY_SLUG[slug]) ||
    normalizeText([subtitle, metaDescription].filter(Boolean).join(". "));
  const levelText = /Требуемый уровень катания:\s*([^.<\r\n]+)/i.exec(stripHtmlToText(html))?.[1] ?? null;

  const rawText = normalizeText(
    [
      title,
      subtitle,
      description,
      availability.dateRange ? `Даты: ${availability.dateRange}` : null,
      availability.seats ? `Места: ${availability.seats}` : null,
      priceText ? `Цена: ${priceText}` : null,
      headerInfo.length ? headerInfo.join(". ") : null,
      levelText ? `Уровень: ${levelText}` : null,
      pageUrl,
    ]
      .filter(Boolean)
      .join(". "),
  );

  return [
    {
      externalItemId: pageUrl,
      sourceUrl: pageUrl,
      authorName: source.name,
      rawTitle: truncate(title, 160),
      rawText: truncate(rawText, 2200),
      rawMedia: image ? [{ url: resolveUrl(image, pageUrl) ?? image }] : [],
      rawPayload: {
        discoveryUrl: pageUrl,
        mode: "allaboutkamchatka_program_detail",
        slug,
        subtitle,
        dateRange: availability.dateRange,
        seats: availability.seats,
        headerInfo,
        price: priceText || null,
      },
    },
  ];
}

function parseAllAboutKamchatkaProgramGridItems(source: Source, html: string, pageUrl: string): CollectedItem[] {
  if (!/program-simprog-element/i.test(html)) return [];

  const chunks = html.split(/<a\b[^>]*data-entity="program-detail-url"[^>]*href="/i).slice(1);
  const items: CollectedItem[] = [];

  for (const chunk of chunks) {
    const hrefMatch = /^([^"]+)"/i.exec(chunk);
    const resolved = hrefMatch?.[1] ? resolveUrl(hrefMatch[1], pageUrl) : null;
    if (!resolved || isUtilityUrl(resolved)) continue;

    const title = normalizeText(/class="program-simprog-element-title"[^>]*>([\s\S]*?)<\/div>/i.exec(chunk)?.[1] ?? "");
    const slug = getKamchatkaProgramSlug(resolved);
    if (!title || (!(slug && KAMCHATKA_TITLE_BY_SLUG[slug]) && !isKamchatkaFreerideProgramTitle(title))) continue;

    const seasonLabel = normalizeText(/class="program-simprog-tag"[^>]*>([\s\S]*?)<\/span>/i.exec(chunk)?.[1] ?? "");
    const nearestDate = normalizeText(
      /program-simprog-element-info-c-key">\s*Nearest date:\s*<\/div>\s*<div class="program-simprog-element-info-c-value">([\s\S]*?)<\/div>/i.exec(
        chunk,
      )?.[1] ?? "",
    );
    const seats = normalizeText(
      /program-simprog-element-info-c-key">\s*Free places:\s*<\/div>\s*<div class="program-simprog-element-info-c-value">([\s\S]*?)<\/div>/i.exec(
        chunk,
      )?.[1] ?? "",
    );
    const price = normalizeText(/class="program-simprog-element-photo-price">([\s\S]*?)<\/div>/i.exec(chunk)?.[1] ?? "");
    const image = /url\('([^']+)'\)/i.exec(chunk)?.[1] ?? null;

    const rawText = normalizeText(
      [
        title,
        seasonLabel ? `Сезон: ${seasonLabel}` : null,
        nearestDate ? `Ближайшая дата: ${nearestDate}` : null,
        seats ? `Места: ${seats}` : null,
        price ? `Цена: ${price}` : null,
        "Тип события: freeride / ski trip",
        resolved,
      ]
        .filter(Boolean)
        .join(". "),
    );
    if (!nearestDate || !hasEventSignals(rawText, resolved)) continue;

    items.push({
      externalItemId: resolved,
      sourceUrl: resolved,
      authorName: source.name,
      rawTitle: truncate((slug && KAMCHATKA_TITLE_BY_SLUG[slug]) || title, 160),
      rawText: truncate(rawText, 1600),
      rawMedia: image ? [{ url: resolveUrl(image, pageUrl) ?? image }] : [],
      rawPayload: {
        discoveryUrl: pageUrl,
        mode: "allaboutkamchatka_program_grid",
        seasonLabel: seasonLabel || null,
        nearestDate: nearestDate || null,
        seats: seats || null,
        price: price || null,
      },
    });
  }

  return items;
}

function parseHtmlDiscoveryItems(source: Source, html: string, pageUrl: string): CollectedItem[] {
  const allAboutDetailItems = parseAllAboutKamchatkaProgramDetailItem(source, html, pageUrl);
  if (allAboutDetailItems.length > 0) return allAboutDetailItems;

  if (shouldUseAllAboutKamchatkaProgramGrid(source, pageUrl)) {
    return parseAllAboutKamchatkaProgramGridItems(source, html, pageUrl);
  }

  const calendarItems = parseCalendarGridItems(source, html, pageUrl);
  if (calendarItems.length > 0) return calendarItems;

  const items: CollectedItem[] = [];
  const pageImage =
    /<meta[^>]+property="og:image"[^>]+content="([^"]+)"/i.exec(html)?.[1] ??
    /<meta[^>]+name="twitter:image"[^>]+content="([^"]+)"/i.exec(html)?.[1] ??
    null;
  const anchorPattern = /<a\b[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
  const baseHost = normalizeHost(new URL(pageUrl).hostname);
  const seen = new Set<string>();
  let match: RegExpExecArray | null;
  while ((match = anchorPattern.exec(html)) !== null) {
    const resolved = resolveUrl(match[1], pageUrl);
    if (!resolved || seen.has(resolved) || isUtilityUrl(resolved)) continue;
    if (normalizeHost(new URL(resolved).hostname) !== baseHost) continue;
    const linkText = stripHtmlToText(match[2]);
    if (!hasEventSignals(linkText, resolved)) continue;
    const contextStart = Math.max(0, match.index - 900);
    const contextEnd = Math.min(html.length, anchorPattern.lastIndex + 1800);
    const contextBlock = html.slice(contextStart, contextEnd);
    const contextText = stripHtmlToText(contextBlock);
    if (!hasEventSignals(contextText, resolved)) continue;
    items.push({
      externalItemId: resolved,
      sourceUrl: resolved,
      authorName: source.name,
      rawTitle: truncate(linkText, 160),
      rawText: truncate(contextText, 2200),
      rawMedia: [
        {
          url: extractContextImageUrl(contextBlock, pageUrl) ?? (pageImage ? resolveUrl(pageImage, pageUrl) : null),
        },
      ].filter((item) => item.url) as Array<{ url: string }>,
      rawPayload: {
        discoveryUrl: pageUrl,
        mode: "html_link_context",
      },
    });
    seen.add(resolved);
    if (items.length >= 12) break;
  }

  if (items.length > 0) return items;
  return parseHtmlSnapshot(source, html, pageUrl);
}

type TrialNinjaRouteDescriptor = {
  routePath: string;
  routeUrl: string;
  assetUrl: string;
  title: string;
  description: string;
};

function shouldUseTrialNinjaParser(source: Source, pageUrl: string): boolean {
  try {
    const host = normalizeHost(new URL(pageUrl).hostname);
    return host === "bike-camp.ru" && /trialninja/i.test(source.name);
  } catch {
    return false;
  }
}

function parseTrialNinjaRouteDescriptors(indexBundle: string, bundleUrl: string, pageUrl: string): TrialNinjaRouteDescriptor[] {
  const descriptors: TrialNinjaRouteDescriptor[] = [];
  const seen = new Set<string>();
  const routePattern =
    /path:"(\/bike-camp\/[^"]+)"[\s\S]*?import\("\.\/([^"]+\.js)"\)[\s\S]*?meta:\{title:"([^"]+)",description:"([^"]*)"/g;
  let match: RegExpExecArray | null;
  while ((match = routePattern.exec(indexBundle)) !== null) {
    const routePath = match[1];
    if (!routePath || routePath === "/bike-camp" || seen.has(routePath)) continue;
    const routeUrl = resolveUrl(routePath, pageUrl);
    const assetUrl = resolveUrl(match[2], bundleUrl);
    if (!routeUrl || !assetUrl) continue;
    seen.add(routePath);
    descriptors.push({
      routePath,
      routeUrl,
      assetUrl,
      title: normalizeText(match[3]),
      description: normalizeText(match[4]),
    });
  }
  return descriptors;
}

function extractTrialNinjaDateLabel(chunk: string): string | null {
  const patterns = [
    /\b\d{1,2}[–-]\d{1,2}\s+(?:января|февраля|марта|апреля|мая|июня|июля|августа|сентября|октября|ноября|декабря)\s+\d{4}\b/i,
    /\b\d{1,2}\s+(?:января|февраля|марта|апреля|мая|июня|июля|августа|сентября|октября|ноября|декабря)\s+[–-]\s*\d{1,2}\s+(?:января|февраля|марта|апреля|мая|июня|июля|августа|сентября|октября|ноября|декабря)\s+\d{4}\b/i,
  ];
  for (const pattern of patterns) {
    const found = pattern.exec(chunk)?.[0];
    if (found) return normalizeText(found.replace(/\s+/g, " "));
  }
  return null;
}

function extractTrialNinjaLocationLabel(chunk: string): string | null {
  const match = /(Краснодарский край|Нижний Новгород|Карачаево-Черкесия)/i.exec(chunk)?.[1];
  return match ? normalizeText(match) : null;
}

function extractTrialNinjaPriceLabel(chunk: string): string | null {
  const text = normalizeText(chunk.replace(/<[^>]+>/g, " "));
  const prices = [...text.matchAll(/(\d{1,3}(?:\s\d{3})+)\s*₽/g)]
    .map((match) => Number(match[1].replace(/[^\d]/g, "")))
    .filter((value) => Number.isFinite(value) && value >= 10000);
  if (!prices.length) return null;
  const lowest = Math.min(...prices);
  return `${lowest.toLocaleString("ru-RU")} ₽`;
}

function extractTrialNinjaImageUrl(chunk: string, pageUrl: string): string | null {
  const imagePath =
    /"(\/images\/camp\/[^"]+\.(?:webp|jpg|jpeg|png))"/i.exec(chunk)?.[1] ??
    /"(\/images\/[^"]+\.(?:webp|jpg|jpeg|png))"/i.exec(chunk)?.[1] ??
    null;
  return imagePath ? resolveUrl(imagePath, pageUrl) : null;
}

function buildTrialNinjaCollectedItem(source: Source, descriptor: TrialNinjaRouteDescriptor, chunk: string): CollectedItem | null {
  const heroDate = extractTrialNinjaDateLabel(chunk);
  const location = extractTrialNinjaLocationLabel(chunk);
  const price = extractTrialNinjaPriceLabel(chunk);
  const imageUrl = extractTrialNinjaImageUrl(chunk, descriptor.routeUrl);
  const rawText = normalizeText(
    [
      descriptor.title,
      descriptor.description,
      heroDate ? `Даты: ${heroDate}` : null,
      location ? `Локация: ${location}` : null,
      price ? `Цена: ${price}` : null,
      "Тип события: bike camp",
      "Бронирование: https://t.me/Trial_Ninja",
      `Подробности: ${descriptor.routeUrl}`,
    ]
      .filter(Boolean)
      .join(". "),
  );
  if (!descriptor.title || !heroDate || !location) return null;

  return {
    externalItemId: descriptor.routeUrl,
    sourceUrl: descriptor.routeUrl,
    authorName: source.name,
    rawTitle: descriptor.title,
    rawText: truncate(rawText, 2200),
    rawMedia: imageUrl ? [{ url: imageUrl }] : [],
    rawPayload: {
      mode: "trialninja_vite_routes",
      routePath: descriptor.routePath,
      assetUrl: descriptor.assetUrl,
    },
  };
}

function getSourceUrlCandidates(source: Source): string[] {
  const urls = [
    normalizeSourceUrl(source),
    ...getSourceStringArrayMeta(source, "verificationUrls"),
    ...getSourceStringArrayMeta(source, "fetchUrls"),
    ...getSourceSpecificFetchUrls(source),
  ];
  const normalized = urls
    .map((value) => value.trim())
    .filter((value) => /^https?:\/\//i.test(value) || source.type === "telegram" || source.type === "instagram");
  return [...new Set(normalized)];
}

function getSourceSpecificFetchUrls(source: Source): string[] {
  if (/kamchatka freeride community/i.test(source.name)) {
    return [
      "https://www.allaboutkamchatka.ru/en/programs/?sort=date",
      "https://www.allaboutkamchatka.ru/programs/sailing-kamchatka/",
    ];
  }
  return [];
}

function normalizeSourceUrl(source: Source): string {
  const value = source.urlOrHandle.trim();
  if (source.type === "telegram") {
    if (!/^https?:\/\//i.test(value)) {
      return `https://t.me/s/${value.replace(/^@/, "")}`;
    }
    const match = /^https?:\/\/t\.me\/(?:(?:s|joinchat)\/)?([^/?#]+)/i.exec(value);
    if (match?.[1]) {
      return `https://t.me/s/${match[1]}`;
    }
  }
  if (source.type === "instagram" && !/^https?:\/\//i.test(value)) {
    return `https://www.instagram.com/${value.replace(/^@/, "").replace(/^\/+|\/+$/g, "")}/`;
  }
  return value;
}

async function fetchJsonWithRetry(url: string, headers?: Record<string, string>): Promise<unknown> {
  if (!fetchFn) throw new Error("Fetch API is not available in this runtime");
  let lastError: Error | null = null;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15000);
      const response = (await fetchFn(url, {
        signal: controller.signal as unknown,
        headers: {
          "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135 Safari/537.36",
          accept: "*/*",
          ...headers,
        },
      })) as {
        ok: boolean;
        status: number;
        json: () => Promise<unknown>;
      };
      clearTimeout(timeout);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      return await response.json();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      await new Promise((resolve) => setTimeout(resolve, attempt * 400));
    }
  }
  throw lastError ?? new Error("Unable to fetch JSON source");
}

async function fetchTextWithRetry(url: string): Promise<string> {
  if (!fetchFn) throw new Error("Fetch API is not available in this runtime");
  let lastError: Error | null = null;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15000);
      const response = (await fetchFn(url, {
        signal: controller.signal as unknown,
        headers: {
          "user-agent": "MyWaveTravelBot/0.1 (+internal ingestion pipeline)",
          accept: "text/html,application/rss+xml,application/atom+xml,application/xml,text/xml,*/*",
        },
      })) as {
        ok: boolean;
        status: number;
        text: () => Promise<string>;
      };
      clearTimeout(timeout);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      return await response.text();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      await new Promise((resolve) => setTimeout(resolve, attempt * 400));
    }
  }
  throw lastError ?? new Error("Unable to fetch source");
}

function extractInstagramUsername(value: string): string | null {
  const normalized = normalizeText(value);
  if (!normalized) return null;
  if (/^https?:\/\//i.test(normalized)) {
    try {
      const url = new URL(normalized);
      if (!/instagram\.com$/i.test(normalizeHost(url.hostname))) return null;
      const parts = url.pathname.split("/").filter(Boolean);
      if (parts.length === 0) return null;
      const head = parts[0].toLowerCase();
      // Пост/рил/клип — не профиль; сбор идёт по HTML snapshot, а не web_profile_info.
      if (["reel", "reels", "p", "tv"].includes(head) && parts[1]) {
        return null;
      }
      if (head === "stories" && parts[1]) {
        return null;
      }
      return parts[0].replace(/^@/, "") || null;
    } catch {
      return null;
    }
  }
  return normalized.replace(/^@/, "").replace(/^\/+|\/+$/g, "") || null;
}

function extractInstagramCaption(edge: Record<string, unknown>): string {
  const edges =
    edge
      && typeof edge === "object"
      && !Array.isArray(edge)
      && (edge as { edge_media_to_caption?: { edges?: Array<{ node?: { text?: string } }> } }).edge_media_to_caption?.edges;
  const first = Array.isArray(edges) ? edges[0]?.node?.text : null;
  return normalizeText(first);
}

function deriveInstagramPostTitle(caption: string, sourceName: string): string | null {
  const normalized = normalizeText(caption);
  if (!normalized) return truncate(sourceName, 140);
  const firstLine = normalized.split(/\n+/)[0]?.trim() ?? normalized;
  return truncate(firstLine || normalized, 140);
}

function getInstagramEdgeImage(edge: Record<string, unknown>): string | null {
  const node = edge as {
    display_url?: string | null;
    thumbnail_src?: string | null;
    thumbnail_tall_src?: string | null;
    video_url?: string | null;
  };
  return (
    normalizeRemoteAssetUrl(node.display_url) ??
    normalizeRemoteAssetUrl(node.thumbnail_tall_src) ??
    normalizeRemoteAssetUrl(node.thumbnail_src) ??
    normalizeRemoteAssetUrl(node.video_url) ??
    null
  );
}

async function parseInstagramWebProfileItems(source: Source, profileUrl: string): Promise<CollectedItem[]> {
  const username = extractInstagramUsername(profileUrl) ?? extractInstagramUsername(source.urlOrHandle);
  if (!username) return [];
  const payload = (await fetchJsonWithRetry(`https://www.instagram.com/api/v1/users/web_profile_info/?username=${encodeURIComponent(username)}`, {
    "x-ig-app-id": "936619743392459",
    "x-requested-with": "XMLHttpRequest",
    referer: `https://www.instagram.com/${username}/`,
  })) as {
    data?: {
      user?: {
        full_name?: string | null;
        biography?: string | null;
        external_url?: string | null;
        bio_links?: Array<{ url?: string | null; title?: string | null }>;
        edge_owner_to_timeline_media?: {
          edges?: Array<{ node?: Record<string, unknown> }>;
        };
      };
    };
  };

  const user = payload.data?.user;
  const edges = user?.edge_owner_to_timeline_media?.edges ?? [];
  const externalLinks = [
    normalizeRemoteAssetUrl(user?.external_url),
    ...(user?.bio_links ?? []).map((item) => normalizeRemoteAssetUrl(item.url)).filter(Boolean),
  ].filter((value, index, array): value is string => Boolean(value) && array.indexOf(value) === index);
  const biography = normalizeText(user?.biography);
  const authorName = firstNonEmpty(user?.full_name, source.name) ?? source.name;

  return edges
    .map((edgeWrapper) => edgeWrapper?.node ?? null)
    .filter((edge): edge is Record<string, unknown> => Boolean(edge) && typeof edge === "object" && !Array.isArray(edge))
    .map((edge) => {
      const shortcode = typeof edge.shortcode === "string" ? edge.shortcode : null;
      const caption = extractInstagramCaption(edge);
      const locationName =
        edge.location && typeof edge.location === "object" && !Array.isArray(edge.location)
          ? normalizeText((edge.location as { name?: string | null }).name)
          : "";
      const rawText = normalizeText(
        [
          caption,
          locationName ? `Локация: ${locationName}` : null,
          biography ? `Профиль: ${biography}` : null,
          ...externalLinks,
        ]
          .filter(Boolean)
          .join(". "),
      );
      const imageUrl = getInstagramEdgeImage(edge);
      const takenAt =
        typeof edge.taken_at_timestamp === "number"
          ? new Date(edge.taken_at_timestamp * 1000)
          : null;
      const postUrl = shortcode ? `https://www.instagram.com/p/${shortcode}/` : `https://www.instagram.com/${username}/`;
      return {
        externalItemId: shortcode ?? postUrl,
        sourceUrl: postUrl,
        authorName,
        publishedAt: takenAt,
        rawTitle: deriveInstagramPostTitle(caption, source.name),
        rawText: truncate(rawText, 2200),
        rawMedia: imageUrl ? [{ url: imageUrl }] : [],
        rawPayload: {
          mode: "instagram_web_profile_info",
          username,
          locationName,
          bioLinks: externalLinks,
          profileUrl: `https://www.instagram.com/${username}/`,
        },
      } satisfies CollectedItem;
    })
    .filter((item) => item.rawText || item.rawTitle);
}

async function parseTrialNinjaSiteItems(source: Source, html: string, pageUrl: string): Promise<CollectedItem[]> {
  const bundlePath = /<script[^>]+type="module"[^>]+src="([^"]*index[^"]+\.js)"/i.exec(html)?.[1];
  const bundleUrl = bundlePath ? resolveUrl(bundlePath, pageUrl) : null;
  if (!bundleUrl) return [];

  const indexBundle = await fetchTextWithRetry(bundleUrl);
  const routes = parseTrialNinjaRouteDescriptors(indexBundle, bundleUrl, pageUrl);
  const items: CollectedItem[] = [];
  for (const route of routes) {
    try {
      const chunk = await fetchTextWithRetry(route.assetUrl);
      const item = buildTrialNinjaCollectedItem(source, route, chunk);
      if (item) items.push(item);
    } catch {
      // Skip broken route chunks, but keep the rest of the source publishable.
    }
  }
  return items;
}

function parseRssOrAtom(source: Source, payload: string): CollectedItem[] {
  const items: CollectedItem[] = [];
  const rssBlocks = [...payload.matchAll(/<item\b[\s\S]*?<\/item>/gi)].map((match) => match[0]);
  for (const block of rssBlocks) {
    const title = parseFeedItemBlock(block, "title");
    const link = parseFeedItemBlock(block, "link");
    const description = parseFeedItemBlock(block, "description");
    const guid = parseFeedItemBlock(block, "guid");
    const pubDate = parseFeedItemBlock(block, "pubDate");
    const mediaUrl = parseAttr(block, "url");
    items.push({
      externalItemId: guid ?? link ?? title,
      sourceUrl: link ?? normalizeSourceUrl(source),
      authorName: source.name,
      publishedAt: toDateIfValid(pubDate),
      rawTitle: title,
      rawText: description,
      rawMedia: mediaUrl ? [{ url: mediaUrl }] : [],
      rawPayload: { block },
    });
  }

  const atomBlocks = [...payload.matchAll(/<entry\b[\s\S]*?<\/entry>/gi)].map((match) => match[0]);
  for (const block of atomBlocks) {
    const title = parseFeedItemBlock(block, "title");
    const summary = parseFeedItemBlock(block, "summary") ?? parseFeedItemBlock(block, "content");
    const id = parseFeedItemBlock(block, "id");
    const updated = parseFeedItemBlock(block, "updated") ?? parseFeedItemBlock(block, "published");
    const link = /<link\b[^>]*href="([^"]+)"/i.exec(block)?.[1] ?? normalizeSourceUrl(source);
    const mediaUrl =
      /<(?:media:thumbnail|media:content)\b[^>]*url="([^"]+)"/i.exec(block)?.[1] ??
      /<img[^>]*src="([^"]+)"/i.exec(block)?.[1] ??
      null;

    items.push({
      externalItemId: id ?? link ?? title,
      sourceUrl: link,
      authorName: source.name,
      publishedAt: toDateIfValid(updated),
      rawTitle: title,
      rawText: summary,
      rawMedia: mediaUrl ? [{ url: mediaUrl }] : [],
      rawPayload: { block },
    });
  }

  return items.filter((item) => item.externalItemId || item.rawTitle || item.rawText);
}

function extractTelegramMediaUrls(block: string): string[] {
  const urls = [
    ...block.matchAll(/tgme_widget_message_photo_wrap[\s\S]*?background-image:url\('([^']+)'\)/gi),
    ...block.matchAll(/tgme_widget_message_video_thumb" style="background-image:url\('([^']+)'\)/gi),
    ...block.matchAll(/tgme_widget_message_photo link_preview_media" style="background-image:url\('([^']+)'\)/gi),
  ]
    .map((match) => match[1]?.trim())
    .filter((value): value is string => Boolean(value) && !/\/\/telegram\.org\/img\/emoji\//i.test(value));

  return [...new Set(urls)];
}

function parseTelegramHtml(source: Source, html: string): CollectedItem[] {
  const items: CollectedItem[] = [];
  const blocks = html.match(/<div class="tgme_widget_message\b[\s\S]*?(?=<div class="tgme_widget_message\b|<\/section>|$)/gi) ?? [];
  for (const block of blocks) {
    const post = parseAttr(block, "data-post");
    const time = /<time[^>]*datetime="([^"]+)"/i.exec(block)?.[1] ?? null;
    const textBlock = /<div class="tgme_widget_message_text[^"]*"[^>]*>([\s\S]*?)<\/div>/i.exec(block)?.[1] ?? "";
    const mediaUrls = extractTelegramMediaUrls(block);
    const title = /<div class="tgme_widget_message_author[^"]*"[^>]*>[\s\S]*?<span[^>]*>([\s\S]*?)<\/span>/i.exec(block)?.[1] ?? source.name;
    const link = post ? `https://t.me/${post}` : normalizeSourceUrl(source);
    items.push({
      externalItemId: post ?? link,
      sourceUrl: link,
      authorName: source.name,
      publishedAt: toDateIfValid(time),
      rawTitle: normalizeText(title),
      rawText: normalizeText(textBlock),
      rawMedia: mediaUrls.map((url) => ({ url })),
      rawPayload: { block },
    });
  }
  return items.filter((item) => item.externalItemId || item.rawText);
}

function parseHtmlSnapshot(source: Source, html: string, pageUrl = normalizeSourceUrl(source)): CollectedItem[] {
  const title = /<meta[^>]+property="og:title"[^>]+content="([^"]+)"/i.exec(html)?.[1] ?? /<title>([\s\S]*?)<\/title>/i.exec(html)?.[1];
  const description =
    /<meta[^>]+property="og:description"[^>]+content="([^"]+)"/i.exec(html)?.[1] ??
    /<meta[^>]+name="description"[^>]+content="([^"]+)"/i.exec(html)?.[1] ??
    "";
  const image = /<meta[^>]+property="og:image"[^>]+content="([^"]+)"/i.exec(html)?.[1] ?? null;
  const canonical = /<meta[^>]+property="og:url"[^>]+content="([^"]+)"/i.exec(html)?.[1] ?? pageUrl;
  return [
    {
      externalItemId: canonical,
      sourceUrl: canonical,
      authorName: source.name,
      rawTitle: normalizeText(title),
      rawText: normalizeText(description),
      rawMedia: image ? [{ url: image }] : [],
      rawPayload: { snapshot: true },
    },
  ].filter((item) => item.rawTitle || item.rawText);
}

async function collectItemsForSource(source: Source): Promise<CollectedItem[]> {
  const collected: CollectedItem[] = [];
  const seen = new Set<string>();
  const instagramSeenUsers = new Set<string>();
  let trialNinjaParsed = false;
  let lastError: Error | null = null;
  for (const url of getSourceUrlCandidates(source)) {
    try {
      let parsed: CollectedItem[] = [];

      const isInstagramUrl = Boolean(extractInstagramUsername(url)) && /instagram\.com/i.test(url);
      if (isInstagramUrl) {
        const username = extractInstagramUsername(url) ?? extractInstagramUsername(source.urlOrHandle);
        if (!username || instagramSeenUsers.has(username)) continue;
        instagramSeenUsers.add(username);
        parsed = await parseInstagramWebProfileItems(source, url);
      } else {
        const payload = await fetchTextWithRetry(resolveUrl(url, normalizeSourceUrl(source)) ?? url);
        const lowerPayload = payload.toLowerCase();

        if (shouldUseTrialNinjaParser(source, url)) {
        if (trialNinjaParsed) continue;
        parsed = await parseTrialNinjaSiteItems(source, payload, url);
        trialNinjaParsed = true;
        } else {
          parsed =
            /^https?:\/\/t\.me\//i.test(url)
              ? parseTelegramHtml(source, payload)
              : source.type === "rss" || /<(rss|feed)\b/i.test(lowerPayload) || /\.(xml|rss|atom)(?:$|\?)/i.test(url)
                ? parseRssOrAtom(source, payload)
                : parseHtmlDiscoveryItems(source, payload, url);
        }
      }

      for (const item of parsed) {
        for (const expandedItem of expandCollectedItemsForSource(source, item)) {
          const key = expandedItem.externalItemId ?? expandedItem.sourceUrl ?? makeHash(expandedItem.rawTitle, expandedItem.rawText);
          if (seen.has(key)) continue;
          seen.add(key);
          collected.push(expandedItem);
        }
      }
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
    }
  }
  if (!collected.length && lastError) {
    throw lastError;
  }
  return collected;
}

async function createSourceRun(sourceId: string, runType: string): Promise<string> {
  const run = await prisma.sourceRun.create({
    data: {
      sourceId,
      runType,
      status: "running",
    },
  });
  return run.id;
}

async function finalizeSourceRun(
  runId: string,
  status: (typeof SOURCE_RUN_STATUSES)[number],
  data: { itemsFound?: number; itemsCreated?: number; errorMessage?: string | null; metaJson?: Prisma.InputJsonValue } = {},
) {
  await prisma.sourceRun.update({
    where: { id: runId },
    data: {
      status,
      finishedAt: new Date(),
      itemsFound: data.itemsFound ?? undefined,
      itemsCreated: data.itemsCreated ?? undefined,
      errorMessage: data.errorMessage ?? undefined,
      metaJson: data.metaJson,
    },
  });
}

async function persistCollectedItems(source: Source, items: CollectedItem[], actorId: string | null): Promise<number> {
  let created = 0;
  for (const item of items) {
    const contentHash = makeHash(item.externalItemId, item.sourceUrl, item.rawTitle, item.rawText);
    const existing = await prisma.rawItem.findFirst({
      where: {
        sourceId: source.id,
        OR: [
          item.externalItemId ? { externalItemId: item.externalItemId } : undefined,
          { contentHash },
        ].filter(Boolean) as Prisma.RawItemWhereInput[],
      },
    });
    if (existing) continue;
    const raw = await prisma.$transaction(async (tx) => {
      const r = await tx.rawItem.create({
        data: {
          sourceId: source.id,
          externalItemId: item.externalItemId ?? null,
          sourceType: source.type,
          sourceUrl: item.sourceUrl ?? normalizeSourceUrl(source),
          authorName: item.authorName ?? source.name,
          publishedAt: item.publishedAt ?? null,
          rawTitle: item.rawTitle ?? null,
          rawText: item.rawText ?? null,
          rawMediaJson: (item.rawMedia ?? []) as Prisma.InputJsonValue,
          rawPayloadJson: (item.rawPayload ?? {}) as Prisma.InputJsonValue,
          contentHash,
          parseStatus: "ok",
          fetchedAt: new Date(),
        },
      });
      await tx.contentItem.create({
        data: {
          rawItemId: r.id,
          idempotencyKey: `ingest:raw:${r.id}`,
          workflowStatus: "ingest_collected",
        },
      });
      return r;
    });
    created += 1;
    await writeAuditLog({
      entityType: "raw_item",
      entityId: raw.id,
      changedField: "created",
      oldValue: null,
      newValue: raw.id,
      changedBy: actorId,
      reason: `ingestion collect from ${source.type}`,
    });
  }
  return created;
}

export async function runSourceCollection(sourceId: string, actorId: string | null): Promise<RunSummary & { runId: string }> {
  const source = await prisma.source.findUnique({ where: { id: sourceId } });
  if (!source) {
    throw new Error("Источник не найден");
  }
  const runId = await createSourceRun(source.id, "collect");
  await prisma.source.update({
    where: { id: source.id },
    data: { lastCheckedAt: new Date() },
  });

  try {
    const items = await collectItemsForSource(source);
    const created = await persistCollectedItems(source, items, actorId);
    await finalizeSourceRun(runId, "success", { itemsFound: items.length, itemsCreated: created });
    await prisma.source.update({
      where: { id: source.id },
      data: { lastSuccessAt: new Date() },
    });
    return {
      runId,
      scope: source.name,
      processed: items.length,
      created,
    };
  } catch (error) {
    await finalizeSourceRun(runId, "failed", {
      errorMessage: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

export async function runIngestionJob(actorId: string | null, sourceIds?: string[]): Promise<RunSummary> {
  const sources = await prisma.source.findMany({
    where: sourceIds?.length ? { id: { in: sourceIds }, isActive: true } : { isActive: true },
    orderBy: [{ priority: "asc" }, { updatedAt: "desc" }],
  });
  let processed = 0;
  let created = 0;
  for (const source of sources) {
    try {
      const summary = await runSourceCollection(source.id, actorId);
      processed += summary.processed;
      created += summary.created;
    } catch {
      // One dead source must not stop the whole daily batch.
    }
  }
  return {
    scope: sources.length ? `sources:${sources.length}` : "sources:0",
    processed,
    created,
  };
}

export async function runNormalizationJob(actorId: string | null, sourceIds?: string[]): Promise<RunSummary> {
  const rawItems = await prisma.rawItem.findMany({
    where: {
      normalizedItem: null,
      source: sourceIds?.length ? { id: { in: sourceIds } } : undefined,
    },
    include: {
      source: {
        include: {
          organizer: { select: { id: true, displayName: true } },
        },
      },
    },
    orderBy: { fetchedAt: "asc" },
  });

  let created = 0;
  for (const rawItem of rawItems) {
    const normalized = buildNormalizedDraft(rawItem as RawItemWithSource);
    const normalizedItem = await prisma.normalizedItem.create({
      data: {
        rawItemId: rawItem.id,
        eventType: textWellFormed(normalized.eventType),
        discipline: textWellFormed(normalized.discipline),
        title: textWellFormed(normalized.title),
        descriptionShort: textWellFormed(normalized.descriptionShort),
        descriptionFull: textWellFormed(normalized.descriptionFull),
        country: textWellFormed(normalized.country),
        region: textWellFormed(normalized.region),
        city: textWellFormed(normalized.city),
        venue: textWellFormed(normalized.venue),
        startDate: normalized.startDate,
        endDate: normalized.endDate,
        durationDays: normalized.durationDays,
        level: textWellFormed(normalized.level),
        priceFrom: normalized.priceFrom,
        currency: textWellFormed(normalized.currency),
        organizerName: textWellFormed(normalized.organizerName),
        bookingUrl: textWellFormed(normalized.bookingUrl),
        imageUrl: textWellFormed(normalized.imageUrl),
        confidenceScore: normalized.confidenceScore,
        relevanceScore: normalized.scores.tourismFitScore,
        parseVersion: normalized.parseVersion,
        extractedJson: jsonForJsonb(normalized.extractedJson),
      },
    });
    const eventCandidate = await prisma.eventCandidate.create({
      data: {
        normalizedItemId: normalizedItem.id,
        status: normalized.scores.routedStatus,
        reviewPriority: normalized.scores.reviewPriority,
        trustScore: normalized.scores.trustScore,
        fitScore: normalized.scores.fitScore,
        futureEventScore: normalized.scores.futureEventScore,
        duplicateScore: normalized.scores.duplicateScore,
        finalScore: normalized.scores.finalScore,
        eventLikelihoodScore: normalized.scores.eventLikelihoodScore,
        completenessScore: normalized.scores.completenessScore,
        sourceTrustScore: normalized.scores.sourceTrustScore,
        tourismFitScore: normalized.scores.tourismFitScore,
      },
    });
    await prisma.contentItem.upsert({
      where: { rawItemId: rawItem.id },
      create: {
        rawItemId: rawItem.id,
        idempotencyKey: `ingest:raw:${rawItem.id}`,
        workflowStatus: "draft",
        normalizedItemId: normalizedItem.id,
        eventCandidateId: eventCandidate.id,
      },
      update: {
        normalizedItemId: normalizedItem.id,
        eventCandidateId: eventCandidate.id,
        workflowStatus: "draft",
      },
    });
    created += 1;
    await writeAuditLog({
      entityType: "normalized_item",
      entityId: normalizedItem.id,
      changedField: "created",
      oldValue: null,
      newValue: normalizedItem.id,
      changedBy: actorId,
      reason: "ingestion normalization",
    });
  }

  return {
    scope: sourceIds?.length ? `sources:${sourceIds.length}` : "all",
    processed: rawItems.length,
    created,
  };
}

export async function runDedupJob(actorId: string | null, sourceIds?: string[]): Promise<RunSummary> {
  const candidates = await prisma.eventCandidate.findMany({
    where: {
      status: { in: EVENT_CANDIDATE_STATUSES.filter((status) => status !== "rejected" && status !== "archived") },
      normalizedItem: sourceIds?.length ? { rawItem: { sourceId: { in: sourceIds } } } : undefined,
    },
    include: {
      normalizedItem: {
        include: {
          rawItem: {
            include: {
              source: {
                include: {
                  organizer: { select: { id: true, displayName: true } },
                },
              },
            },
          },
        },
      },
    },
    orderBy: [{ finalScore: "desc" }, { createdAt: "asc" }],
  }) as CandidateWithRelations[];

  const byGroup = new Map<string, CandidateWithRelations[]>();
  for (const candidate of candidates) {
    const groupKey = buildCandidateGroupKey(candidate);
    const list = byGroup.get(groupKey) ?? [];
    list.push(candidate);
    byGroup.set(groupKey, list);
  }

  let updated = 0;
  for (const [groupKey, list] of byGroup.entries()) {
    const group = await prisma.eventGroup.upsert({
      where: { groupKey },
      update: {},
      create: { groupKey, mergeStatus: list.length > 1 ? "merged" : "open" },
    });
    const sorted = [...list].sort((a, b) => {
      const sourceDiff = sourceRank(a.normalizedItem.rawItem.source.type) - sourceRank(b.normalizedItem.rawItem.source.type);
      if (sourceDiff !== 0) return sourceDiff;
      const scoreDiff = b.finalScore - a.finalScore;
      if (scoreDiff !== 0) return scoreDiff;
      return a.createdAt.getTime() - b.createdAt.getTime();
    });
    const canonical = sorted[0];
    await prisma.eventGroup.update({
      where: { id: group.id },
      data: {
        canonicalCandidateId: canonical.id,
        mergeStatus: list.length > 1 ? "merged" : "open",
      },
    });
    for (const candidate of list) {
      const isCanonical = candidate.id === canonical.id;
      await prisma.eventCandidate.update({
        where: { id: candidate.id },
        data: {
          dedupGroupId: group.id,
          duplicateScore: isCanonical ? 0 : 0.95,
          status:
            isCanonical
              ? candidate.status === "new" ? "needs_review" : candidate.status
              : candidate.status === "approved" || candidate.status === "published"
                ? candidate.status
                : "merged",
        },
      });
      updated += 1;
    }
    await writeAuditLog({
      entityType: "event_group",
      entityId: group.id,
      changedField: "dedup_refresh",
      oldValue: null,
      newValue: canonical.id,
      changedBy: actorId,
      reason: "ingestion dedup",
    });
  }

  return {
    scope: sourceIds?.length ? `sources:${sourceIds.length}` : "all",
    processed: candidates.length,
    created: byGroup.size,
    updated,
  };
}

async function resolveOrganizerForCandidate(tx: Prisma.TransactionClient, candidate: CandidateWithRelations): Promise<string> {
  const sourceOrganizerId = candidate.normalizedItem.rawItem.source.organizerId;
  if (sourceOrganizerId) return sourceOrganizerId;

  const organizerName = firstNonEmpty(
    candidate.normalizedItem.organizerName,
    candidate.normalizedItem.rawItem.authorName,
    candidate.normalizedItem.rawItem.source.name,
  ) ?? "Unknown organizer";

  const existing = await tx.organizer.findFirst({
    where: {
      displayName: {
        equals: organizerName,
        mode: "insensitive",
      },
    },
  });
  if (existing) return existing.id;

  const created = await tx.organizer.create({
    data: {
      displayName: organizerName,
      legalStatus: null,
      contactEmail: `ingestion+${candidate.id}@mywave.local`,
      contactPhone: null,
      verificationStatus: "listed",
    },
  });
  return created.id;
}

export async function publishCandidateToDraft(
  candidateId: string,
  actorId: string | null,
  editorNotes?: string | null,
  options?: DailySyncOptions,
): Promise<PublishCandidateResult> {
  const candidate = (await prisma.eventCandidate.findUnique({
    where: { id: candidateId },
    include: {
      publishedProgram: true,
      normalizedItem: {
        include: {
          rawItem: {
            include: {
              source: {
                include: {
                  organizer: { select: { id: true, displayName: true } },
                },
              },
            },
          },
        },
      },
    },
  })) as CandidateWithRelations | null;

  if (!candidate) throw new Error("Кандидат не найден");
  if (candidate.status === "rejected" || candidate.status === "archived") {
    throw new Error("Нельзя публиковать отклонённый или архивный кандидат");
  }
  if (candidate.publishedProgram) {
    return candidate.publishedProgram;
  }

  const source = candidate.normalizedItem.rawItem.source;
  const originalImageUrl =
    candidate.normalizedItem.imageUrl ??
    getSourceStringMeta(source, "fallbackImageUrl") ??
    options?.fallbackImageUrl ??
    null;
  const resolvedImageUrl =
    (await cacheExternalProgramMediaForWeb(originalImageUrl, `${source.name}-${candidate.id}`)) ??
    originalImageUrl;

  const published: PublishCandidateResult = await prisma.$transaction(async (tx): Promise<PublishCandidateResult> => {
    /** Только при явном вызове (sync job / autoPublishReady), не при ручном publish без options */
    const globalApOn = options?.autoPublishEnabled === true;
    const autoPublishRequested = shouldRunAutoPublishForSource(source, globalApOn);
    const organizerId = await resolveOrganizerForCandidate(tx, candidate);
    const programPayload = createDraftProgramPayload(candidate, organizerId);
    const duplicateProgram = await findExistingPublishedProgramDuplicate(
      tx,
      buildProgramDedupProbe(programPayload, organizerId),
    );
    if (duplicateProgram) {
      const duplicateLink = duplicateProgram.publishedPrograms[0];
      if (!duplicateLink) {
        throw new Error(`Duplicate program ${duplicateProgram.id} has no published link`);
      }
      const raw = candidate.normalizedItem.rawItem;
      await tx.program.update({
        where: { id: duplicateProgram.id },
        data: buildAutopilotMergeUpdate(programPayload, source, raw, {
          id: duplicateProgram.id,
          ingestedAt: duplicateProgram.ingestedAt,
        }),
      });
      if (resolvedImageUrl && !duplicateProgram.media.some((media) => media.url === resolvedImageUrl)) {
        await tx.programMedia.create({
          data: {
            programId: duplicateProgram.id,
            mediaType: "image",
            url: resolvedImageUrl,
            caption: "Добавлено из duplicate ingestion candidate",
          },
        });
      }
      let outLink = duplicateLink;
      let gateResult: { ok: boolean; missing: string[] } | null = null;
      /** Автовитрина: только при успешном {@link canPublishAutopilot} (никаких обходов). */
      if (autoPublishRequested) {
        const publishCheck = await tx.program.findUnique({
          where: { id: duplicateProgram.id },
          include: programIncludeForPublishGate,
        });
        if (publishCheck) {
          gateResult = canPublishAutopilot(publishCheck);
          if (gateResult.ok) {
            await tx.program.update({ where: { id: duplicateProgram.id }, data: { publishStatus: "published" } });
            if (duplicateLink.publishStatus !== "published") {
              outLink = await tx.publishedProgram.update({
                where: { id: duplicateLink.id },
                data: { publishStatus: "published" },
              });
            } else {
              outLink = duplicateLink;
            }
            console.log(
              JSON.stringify({
                event: "ingestion_autopublish",
                kind: "auto_published",
                path: "duplicate_merge",
                candidateId: candidate.id,
                programId: duplicateProgram.id,
                sourceId: source.id,
              }),
            );
          } else {
            console.log(
              JSON.stringify({
                event: "ingestion_autopublish",
                kind: "autopublish_skipped",
                path: "duplicate_merge",
                programId: duplicateProgram.id,
                candidateId: candidate.id,
                sourceId: source.id,
                reason: "gate",
                missing: gateResult.missing,
              }),
            );
          }
        }
      }
      const progRowDup = await tx.program.findUnique({
        where: { id: duplicateProgram.id },
        select: { publishStatus: true },
      });
      const wasPublishedBefore = duplicateProgram.publishStatus === "published";
      const duplicateEndsPublished = progRowDup?.publishStatus === "published";
      console.log(
        JSON.stringify({
          event: "ingestion_autopublish",
          kind: "duplicate_merged",
          candidateId: candidate.id,
          programId: duplicateProgram.id,
          sourceId: source.id,
          programUpdated: true,
          publishedOrRetained: duplicateEndsPublished,
          retainedWithoutGatePass: wasPublishedBefore && Boolean(gateResult && !gateResult.ok),
        }),
      );
      await tx.eventCandidate.update({
        where: { id: candidate.id },
        data: {
          status: "merged",
          duplicateScore: 1,
          reviewedBy: actorId ?? undefined,
          reviewedAt: new Date(),
          decisionNotes: editorNotes ?? `Дубликат опубликованной программы ${duplicateProgram.id}`,
        },
      });
      const dupGate: AutopilotPublishMeta["gate"] = !autoPublishRequested
        ? "skipped_no_request"
        : gateResult
          ? gateResult.ok
            ? "passed"
            : "failed"
          : "not_applicable";
      return {
        ...outLink,
        duplicateSkipped: true,
        autopilot: globalApOn
          ? {
              path: "duplicate_merge",
              programId: duplicateProgram.id,
              programPublishStatus: progRowDup?.publishStatus ?? "unknown",
              autoPublishRequested,
              gate: dupGate,
              gateMissing: gateResult && !gateResult.ok ? gateResult.missing : undefined,
            }
          : undefined,
      };
    }
    const program = await tx.program.create({
      data: programPayload,
    });
    if (resolvedImageUrl) {
      await tx.programMedia.create({
        data: {
          programId: program.id,
          mediaType: "image",
          url: resolvedImageUrl,
          caption: "Создано из ingestion candidate",
        },
      });
    }
    let linkStatus = "draft_created";
    let createGate: { ok: boolean; missing: string[] } | null = null;
    /** Автовитрина: только при успешном {@link canPublishAutopilot} (никаких обходов). */
    if (autoPublishRequested) {
      const publishCheck = await tx.program.findUnique({
        where: { id: program.id },
        include: programIncludeForPublishGate,
      });
      if (publishCheck) {
        createGate = canPublishAutopilot(publishCheck);
        if (createGate.ok) {
          await tx.program.update({
            where: { id: program.id },
            data: { publishStatus: "published" },
          });
          linkStatus = "published";
          console.log(
            JSON.stringify({
              event: "ingestion_autopublish",
              kind: "auto_published",
              path: "create",
              candidateId: candidate.id,
              programId: program.id,
              sourceId: source.id,
            }),
          );
        } else {
          console.log(
            JSON.stringify({
              event: "ingestion_autopublish",
              kind: "autopublish_skipped",
              path: "create",
              programId: program.id,
              candidateId: candidate.id,
              sourceId: source.id,
              reason: "gate",
              missing: createGate.missing,
            }),
          );
        }
      }
    }
    const link = await tx.publishedProgram.create({
      data: {
        candidateId: candidate.id,
        programId: program.id,
        publishStatus: linkStatus,
        editorNotes: editorNotes ?? null,
      },
    });
    await tx.eventCandidate.update({
      where: { id: candidate.id },
      data: {
        status: "published",
        reviewedBy: actorId ?? undefined,
        reviewedAt: new Date(),
        decisionNotes: editorNotes ?? candidate.decisionNotes ?? null,
      },
    });
    const progRowNew = await tx.program.findUnique({
      where: { id: program.id },
      select: { publishStatus: true },
    });
    const createG: AutopilotPublishMeta["gate"] = !autoPublishRequested
      ? "skipped_no_request"
      : createGate
        ? createGate.ok
          ? "passed"
          : "failed"
        : "not_applicable";
    return {
      ...link,
      autopilot: globalApOn
        ? {
            path: "create",
            programId: program.id,
            programPublishStatus: progRowNew?.publishStatus ?? "unknown",
            autoPublishRequested,
            gate: createG,
            gateMissing: createGate && !createGate.ok ? createGate.missing : undefined,
          }
        : undefined,
    };
  });

  if (published.duplicateSkipped) {
    await writeAuditLog({
      entityType: "event_candidate",
      entityId: candidate.id,
      changedField: "duplicate_program_skipped",
      oldValue: candidate.status,
      newValue: "merged",
      changedBy: actorId,
      reason: `duplicate of program ${published.programId}`,
    });
    return published;
  }

  await writeAuditLog({
    entityType: "event_candidate",
    entityId: candidate.id,
    changedField: "published_to_program_draft",
    oldValue: candidate.status,
    newValue: "published",
    changedBy: actorId,
    reason: published.publishStatus === "published" ? "candidate -> auto published program" : "candidate -> program draft",
  });

  return published;
}

export async function approveCandidate(candidateId: string, actorId: string | null, notes?: string | null) {
  const candidate = await prisma.eventCandidate.findUnique({ where: { id: candidateId } });
  if (!candidate) throw new Error("Кандидат не найден");
  const updated = await prisma.eventCandidate.update({
    where: { id: candidateId },
    data: {
      status: "approved",
      decisionNotes: notes ?? candidate.decisionNotes ?? null,
      reviewedBy: actorId ?? undefined,
      reviewedAt: new Date(),
    },
  });
  await writeAuditLog({
    entityType: "event_candidate",
    entityId: updated.id,
    changedField: "status",
    oldValue: candidate.status,
    newValue: updated.status,
    changedBy: actorId,
    reason: notes ?? "candidate approved",
  });
  return updated;
}

export async function rejectCandidate(candidateId: string, actorId: string | null, notes?: string | null) {
  const candidate = await prisma.eventCandidate.findUnique({ where: { id: candidateId } });
  if (!candidate) throw new Error("Кандидат не найден");
  const updated = await prisma.eventCandidate.update({
    where: { id: candidateId },
    data: {
      status: "rejected",
      decisionNotes: notes ?? candidate.decisionNotes ?? null,
      reviewedBy: actorId ?? undefined,
      reviewedAt: new Date(),
    },
  });
  await writeAuditLog({
    entityType: "event_candidate",
    entityId: updated.id,
    changedField: "status",
    oldValue: candidate.status,
    newValue: updated.status,
    changedBy: actorId,
    reason: notes ?? "candidate rejected",
  });
  return updated;
}

function isPhoneLikeTitle(value: string | null): boolean {
  const normalized = normalizeText(value);
  if (!normalized) return false;
  const digits = normalized.replace(/\D/g, "");
  const letters = normalized.replace(/[^a-zа-яё]/gi, "");
  return digits.length >= 7 && letters.length <= 4;
}

function isAutoPublishEligible(candidate: CandidateWithRelations): boolean {
  const normalized = candidate.normalizedItem;
  const sourceUrl = (normalized.rawItem.sourceUrl ?? "").toLowerCase();
  const narrative = normalizeText(
    `${normalized.title ?? ""} ${normalized.descriptionFull ?? ""} ${normalized.descriptionShort ?? ""}`.toLowerCase(),
  );
  const daysToStart = daysFromToday(normalized.startDate);
  const daysToEnd = daysFromToday(normalized.endDate ?? normalized.startDate);
  const hasExplicitDate = getExtractedJsonFlag(normalized.extractedJson, "hasExplicitDateSignal");
  if (isLikelyStatsOrClimateInfographicPostText(narrative)) return false;
  if (candidate.tourismFitScore < 0.28) return false;
  if (!disciplineMentionedInPostText(narrative) && !hasPilotProgramFormatIntent(narrative) && !normalized.eventType) return false;
  if (candidate.finalScore < 0.62) return false;
  if (!hasExplicitDate && !normalized.startDate) return false;
  if ((!normalized.startDate && !normalized.endDate) || daysToEnd == null || daysToEnd < 0) return false;
  if (daysToStart != null && daysToStart > 400) return false;
  if (!normalized.title || normalizeText(normalized.title).length < 8 || isPhoneLikeTitle(normalized.title)) return false;
  if (
    /(^|\/)(contact|contacts|about|aboutus|team|staff|company|companies|o-nas|o-kompanii|komanda)(\/|$)/i.test(sourceUrl) ||
    /(^|\/)(tel:|mailto:)/i.test(sourceUrl)
  ) {
    return false;
  }
  return true;
}

export async function mergeCandidateIntoCanonical(
  candidateId: string,
  canonicalCandidateId: string,
  actorId: string | null,
  notes?: string | null,
) {
  if (candidateId === canonicalCandidateId) {
    throw new Error("Кандидат нельзя слить в самого себя");
  }
  const [candidate, canonical] = await Promise.all([
    prisma.eventCandidate.findUnique({
      where: { id: candidateId },
      include: {
        normalizedItem: {
          include: {
            rawItem: {
              include: {
                source: {
                  include: {
                    organizer: { select: { id: true, displayName: true } },
                  },
                },
              },
            },
          },
        },
      },
    }) as Promise<CandidateWithRelations | null>,
    prisma.eventCandidate.findUnique({
      where: { id: canonicalCandidateId },
      include: {
        normalizedItem: {
          include: {
            rawItem: {
              include: {
                source: {
                  include: {
                    organizer: { select: { id: true, displayName: true } },
                  },
                },
              },
            },
          },
        },
      },
    }) as Promise<CandidateWithRelations | null>,
  ]);
  if (!candidate || !canonical) throw new Error("Не найден кандидат для merge");
  const groupKey = buildCandidateGroupKey(canonical);
  const group = await prisma.eventGroup.upsert({
    where: { groupKey },
    update: { canonicalCandidateId: canonical.id, mergeStatus: "merged" },
    create: {
      groupKey,
      canonicalCandidateId: canonical.id,
      mergeStatus: "merged",
    },
  });
  const updated = await prisma.eventCandidate.update({
    where: { id: candidate.id },
    data: {
      dedupGroupId: group.id,
      status: "merged",
      duplicateScore: 1,
      decisionNotes: notes ?? candidate.decisionNotes ?? null,
      reviewedBy: actorId ?? undefined,
      reviewedAt: new Date(),
    },
  });
  await prisma.eventCandidate.update({
    where: { id: canonical.id },
    data: {
      dedupGroupId: group.id,
    },
  });
  await writeAuditLog({
    entityType: "event_candidate",
    entityId: updated.id,
    changedField: "merged_into",
    oldValue: candidate.dedupGroupId,
    newValue: canonical.id,
    changedBy: actorId,
    reason: notes ?? "manual merge",
  });
  return updated;
}

export async function autoPublishReadyCandidates(
  actorId: string | null,
  options?: DailySyncOptions,
): Promise<AutopilotBatchStats & { published: number }> {
  const globalOn = options?.autoPublishEnabled === true;
  if (!globalOn) {
    const empty: AutopilotBatchStats & { published: number } = {
      checked: 0,
      sourceOptOut: 0,
      notEligible: 0,
      autoCreated: 0,
      autoUpdated: 0,
      autoCreatedPublished: 0,
      autoCreatedGateSkipped: 0,
      duplicateMerged: 0,
      duplicatePublishedOrRetained: 0,
      duplicateRetainedOnly: 0,
      gateSkipped: 0,
      publishFailed: 0,
      published: 0,
    };
    return empty;
  }

  const candidates = (await prisma.eventCandidate.findMany({
    where: {
      status: { in: ["new", "needs_review", "approved"] },
      publishedProgram: null,
      finalScore: { gte: 0.62 },
      normalizedItem: {
        OR: [{ startDate: null }, { startDate: { gte: new Date() } }],
      },
    },
    include: {
      publishedProgram: true,
      normalizedItem: {
        include: {
          rawItem: {
            include: {
              source: {
                include: {
                  organizer: { select: { id: true, displayName: true } },
                },
              },
            },
          },
        },
      },
    },
    orderBy: [{ finalScore: "desc" }, { createdAt: "asc" }],
  })) as CandidateWithRelations[];

  const stats: AutopilotBatchStats & { published: number } = {
    checked: candidates.length,
    sourceOptOut: 0,
    notEligible: 0,
    autoCreated: 0,
    autoUpdated: 0,
    autoCreatedPublished: 0,
    autoCreatedGateSkipped: 0,
    duplicateMerged: 0,
    duplicatePublishedOrRetained: 0,
    duplicateRetainedOnly: 0,
    gateSkipped: 0,
    publishFailed: 0,
    published: 0,
  };

  for (const candidate of candidates) {
    const src = candidate.normalizedItem.rawItem.source;
    if (!shouldRunAutoPublishForSource(src, globalOn)) {
      stats.sourceOptOut += 1;
      console.log(
        JSON.stringify({
          event: "ingestion_autopublish",
          kind: "source_disabled",
          candidateId: candidate.id,
          sourceId: src.id,
          sourceName: src.name,
        }),
      );
      continue;
    }
    if (!isAutoPublishEligible(candidate)) {
      stats.notEligible += 1;
      continue;
    }
    let result: PublishCandidateResult;
    try {
      result = await publishCandidateToDraft(
        candidate.id,
        actorId,
        "Auto-published from scheduled ingestion cycle",
        { ...options, autoPublishEnabled: true },
      );
    } catch (error) {
      stats.publishFailed += 1;
      console.log(
        JSON.stringify({
          event: "ingestion_autopublish",
          kind: "publish_failed",
          candidateId: candidate.id,
          error: error instanceof Error ? error.message : String(error),
        }),
      );
      continue;
    }
    const ap = result.autopilot;
    if (result.duplicateSkipped) {
      stats.duplicateMerged += 1;
      stats.autoUpdated += 1;
      if (ap?.programPublishStatus === "published") {
        stats.duplicatePublishedOrRetained += 1;
        if (ap.gate === "failed") stats.duplicateRetainedOnly += 1;
        /** Считаем «опубликовано автопайплайном» только если мягкий гейт реально прошёл в этом прогоне. */
        if (ap.gate === "passed") stats.published += 1;
      }
    } else {
      stats.autoCreated += 1;
      if (ap?.programPublishStatus === "published" && ap.path === "create" && ap.gate === "passed") {
        stats.autoCreatedPublished += 1;
        stats.published += 1;
      }
      if (ap?.path === "create" && ap.gate === "failed") {
        stats.autoCreatedGateSkipped += 1;
        stats.gateSkipped += 1;
      }
    }
    if (result.duplicateSkipped && ap?.gate === "failed" && ap.path === "duplicate_merge") {
      stats.gateSkipped += 1;
    }
  }

  console.log(
    JSON.stringify({
      event: "ingestion_autopublish_batch_summary",
      ...stats,
    }),
  );

  return stats;
}

export async function runDailySyncJob(actorId: string | null, options?: DailySyncOptions) {
  const sources = await prisma.source.findMany({
    where: { isActive: true },
    orderBy: [{ priority: "asc" }, { updatedAt: "desc" }],
  });
  const dueSourceIds = selectDueSourceIds(sources, options?.sourceLimit);

  if (dueSourceIds.length === 0) {
    const apZero: AutopilotBatchStats & { published: number } = {
      checked: 0,
      sourceOptOut: 0,
      notEligible: 0,
      autoCreated: 0,
      autoUpdated: 0,
      autoCreatedPublished: 0,
      autoCreatedGateSkipped: 0,
      duplicateMerged: 0,
      duplicatePublishedOrRetained: 0,
      duplicateRetainedOnly: 0,
      gateSkipped: 0,
      publishFailed: 0,
      published: 0,
    };
    return {
      scope: "sources:0",
      collect: { scope: "sources:0", processed: 0, created: 0 },
      normalize: { scope: "sources:0", processed: 0, created: 0 },
      dedup: { scope: "sources:0", processed: 0, created: 0, updated: 0 },
      autoPublish: apZero,
    };
  }

  const collect = await runIngestionJob(actorId, dueSourceIds);
  const normalize = await runNormalizationJob(actorId, dueSourceIds);
  const dedup = await runDedupJob(actorId, dueSourceIds);
  const autoPublish = await autoPublishReadyCandidates(actorId, options);

  return {
    scope: `sources:${dueSourceIds.length}`,
    collect,
    normalize,
    dedup,
    autoPublish,
  };
}

export async function getJobDashboard() {
  const [lastRuns, counters] = await Promise.all([
    prisma.sourceRun.findMany({
      take: 20,
      orderBy: { startedAt: "desc" },
      include: {
        source: { select: { id: true, name: true, type: true } },
      },
    }),
    Promise.all([
      prisma.source.count({ where: { isActive: true } }),
      prisma.rawItem.count(),
      prisma.normalizedItem.count(),
      prisma.eventCandidate.count({ where: { status: "needs_review" } }),
      prisma.eventCandidate.count({ where: { status: "approved" } }),
      prisma.eventCandidate.count(),
      prisma.publishedProgram.count(),
      prisma.contentDraft.count(),
    ]),
  ]);
  return {
    jobs: [
      {
        key: "run-daily-sync",
        label: "Run daily sync",
        description: "Collect + normalize + dedup + optional auto-publish for due active sources",
      },
      {
        key: "run-ingestion",
        label: "Run ingestion",
        description: "Collect raw items from active sources",
      },
      {
        key: "run-normalization",
        label: "Run normalization",
        description: "Transform raw items into normalized event drafts",
      },
      {
        key: "run-dedup",
        label: "Run dedup",
        description: "Group overlapping candidates and mark duplicates",
      },
      {
        key: "run-content-pipeline",
        label: "Run content pipeline (unified)",
        description: "collect → normalize → dedup → draft; owner + publish вручную (см. pipeline.runner)",
      },
      {
        key: "run-content-drafts",
        label: "Generate content drafts",
        description: "Deterministic AI-stage drafts (telegram/vk/blog/announce) for normalized content_items",
      },
      {
        key: "send-content-draft-to-telegram",
        label: "Send content draft to Telegram (owner E)",
        description: "Push preview to TELEGRAM_CONTENT_OWNER_CHAT_ID / ALERT; buttons approve/rewrite/reject/skip",
      },
    ],
    counters: {
      sources: counters[0],
      rawItems: counters[1],
      normalizedItems: counters[2],
      needsReview: counters[3],
      approved: counters[4],
      candidates: counters[5],
      published: counters[6],
      contentDrafts: counters[7],
    },
    recentRuns: lastRuns,
    availableJobs: [
      "run-daily-sync",
      "run-ingestion",
      "run-normalization",
      "run-dedup",
      "run-content-drafts",
      "send-content-draft-to-telegram",
    ],
    backlog: {
      activeSources: counters[0],
      rawPendingNormalization: counters[1] - counters[2],
      candidatesNeedsReview: counters[3],
      candidatesApproved: counters[4],
      publishedProgramsLinked: counters[6],
    },
    lastRuns,
  };
}
