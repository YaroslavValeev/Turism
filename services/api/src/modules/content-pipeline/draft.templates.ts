import type { ContentDraftType } from "@prisma/client";

/** Версия шаблонов (детерминированная генерация без LLM). */
export const CONTENT_DRAFT_PROMPT_VERSION = "content-draft-template-v1";
/** «Модель» для воспроизводимости: фактически rule-based. */
export const CONTENT_DRAFT_MODEL_VERSION = "deterministic-rules-v1";

export type NormalizedSnapshot = {
  title: string | null;
  eventType: string | null;
  discipline: string | null;
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
  confidenceScore: number | null;
};

export type DraftTemplateInput = {
  draftType: ContentDraftType;
  normalized: NormalizedSnapshot;
  /** Первоисточник (URL поста / страницы). */
  sourceUrl: string | null;
  sourceName: string;
  missingFields: string[];
};

function fmtDate(d: Date | null): string {
  if (!d) return "";
  try {
    return d.toISOString().slice(0, 10);
  } catch {
    return "";
  }
}

function locationLine(n: NormalizedSnapshot): string {
  const parts = [n.city, n.region, n.country].filter(Boolean) as string[];
  return parts.length ? parts.join(", ") : "";
}

function priceLine(n: NormalizedSnapshot): string {
  if (n.priceFrom == null) return "";
  const cur = n.currency?.trim() || "RUB";
  return `${n.priceFrom} ${cur}`;
}

function buildHashtags(n: NormalizedSnapshot): string[] {
  const tags: string[] = [];
  const push = (raw: string | null | undefined) => {
    const s = String(raw ?? "")
      .trim()
      .replace(/\s+/g, "")
      .replace(/[^a-zA-Zа-яА-ЯёЁ0-9_]/g, "");
    if (s.length >= 2 && tags.length < 6) tags.push(s);
  };
  push(n.discipline);
  push(n.region);
  push(n.country);
  return tags.map((t) => (t.startsWith("#") ? t : `#${t}`));
}

function missingBlock(missingFields: string[]): string {
  if (!missingFields.length) return "";
  return `\n\n[Внимание: в источнике не извлечено — не дополнять: ${missingFields.join(", ")}]`;
}

function sourceFooter(sourceUrl: string | null, sourceName: string): string {
  const link = sourceUrl?.trim();
  if (link) return `\n\nИсточник: ${link}\n(${sourceName})`;
  return `\n\nИсточник: ${sourceName} (URL не указан)`;
}

/**
 * Детерминированный черновик только из фактов normalized + ссылка на источник.
 * Не добавляет дат, цен и мест, которых нет в snapshot.
 */
export function buildDraftTexts(input: DraftTemplateInput): {
  headline: string;
  shortCopy: string;
  longCopy: string;
  cta: string;
  hashtags: string[];
} {
  const { draftType, normalized: n, sourceUrl, sourceName, missingFields } = input;
  const title = n.title?.trim() || "Анонс активного отдыха";
  const organizer = n.organizerName?.trim() || "";
  const loc = locationLine(n);
  const dates =
    n.startDate || n.endDate
      ? [fmtDate(n.startDate), fmtDate(n.endDate)].filter(Boolean).join(" — ")
      : "";
  const price = priceLine(n);
  const hashtags = buildHashtags(n);

  const facts: string[] = [];
  if (n.eventType) facts.push(`Тип: ${n.eventType}`);
  if (n.discipline) facts.push(`Дисциплина: ${n.discipline}`);
  if (dates) facts.push(`Даты: ${dates}`);
  if (loc) facts.push(`Локация: ${loc}`);
  if (n.venue) facts.push(`Площадка: ${n.venue}`);
  if (n.level) facts.push(`Уровень: ${n.level}`);
  if (n.durationDays != null) facts.push(`Длительность: ${n.durationDays} дн.`);
  if (price) facts.push(`Цена от: ${price}`);
  if (organizer) facts.push(`Организатор: ${organizer}`);
  const factBody = facts.length ? facts.join("\n") : "Детали уточняются по первоисточнику.";
  const shortFact = n.descriptionShort?.trim() || factBody.split("\n").slice(0, 2).join("\n");

  const cta =
    n.bookingUrl?.trim() ||
    (sourceUrl?.trim() ? `Подробности и запись: ${sourceUrl.trim()}` : "Подробности — в материале по ссылке на источник.");

  let headline = title;
  let shortCopy = "";
  let longCopy = "";

  switch (draftType) {
    case "telegram_post":
      headline = title.length > 120 ? `${title.slice(0, 117)}…` : title;
      shortCopy = `${shortFact}${missingBlock(missingFields)}${sourceFooter(sourceUrl, sourceName)}`;
      longCopy = `${title}\n\n${factBody}\n\n${n.descriptionFull?.trim() || ""}${missingBlock(missingFields)}${sourceFooter(sourceUrl, sourceName)}`;
      break;
    case "vk_post":
      headline = title;
      longCopy = `${title}\n\n${n.descriptionFull?.trim() || shortFact}\n\n${factBody}${missingBlock(missingFields)}${sourceFooter(sourceUrl, sourceName)}`;
      shortCopy = longCopy.slice(0, 700) + (longCopy.length > 700 ? "…" : "");
      break;
    case "blog_post":
      headline = title;
      longCopy = `# ${title}\n\n${n.descriptionFull?.trim() || n.descriptionShort?.trim() || shortFact}\n\n## Факты\n${factBody}${missingBlock(missingFields)}${sourceFooter(sourceUrl, sourceName)}`;
      shortCopy = n.descriptionShort?.trim() || `${title}\n${factBody}`;
      break;
    case "site_announce":
      headline = title;
      shortCopy = `${shortFact}${missingBlock(missingFields)}`;
      longCopy = `${title}\n${factBody}${sourceFooter(sourceUrl, sourceName)}`;
      break;
    case "facebook_post":
      headline = title;
      shortCopy = `${shortFact}${missingBlock(missingFields)}`;
      longCopy = `${title}\n\n${n.descriptionFull?.trim() || shortFact}${sourceFooter(sourceUrl, sourceName)}`;
      break;
    case "program_card_structured":
      headline = title;
      longCopy = JSON.stringify(
        {
          title,
          discipline: n.discipline,
          organizer,
          dates,
          location: loc || null,
          venue: n.venue,
          level: n.level,
          priceFrom: n.priceFrom,
          currency: n.currency,
          bookingUrl: n.bookingUrl,
          imageUrl: n.imageUrl,
          sourceUrl,
          missingFields,
        },
        null,
        2,
      );
      shortCopy = shortFact;
      break;
    default:
      headline = title;
      shortCopy = shortFact;
      longCopy = `${title}\n${factBody}${sourceFooter(sourceUrl, sourceName)}`;
  }

  return { headline, shortCopy, longCopy, cta, hashtags };
}

export function collectMissingFields(n: NormalizedSnapshot): string[] {
  const missing: string[] = [];
  if (!n.title?.trim()) missing.push("title");
  if (!n.startDate && !n.endDate) missing.push("dates");
  if (!n.discipline?.trim()) missing.push("discipline");
  if (!locationLine(n)) missing.push("location");
  if (n.priceFrom == null) missing.push("price");
  if (!n.organizerName?.trim()) missing.push("organizer");
  if (!n.bookingUrl?.trim()) missing.push("bookingUrl");
  return missing;
}

export function channelTargetsForDraftType(draftType: ContentDraftType): string[] {
  switch (draftType) {
    case "telegram_post":
      return ["telegram_channel"];
    case "vk_post":
      return ["vk"];
    case "facebook_post":
      return ["facebook"];
    case "blog_post":
      return ["site_blog"];
    case "site_announce":
      return ["site_landing"];
    case "program_card_structured":
      return ["site_landing", "site_blog"];
    default:
      return [];
  }
}

/** Набор типов по умолчанию (минимум — telegram; остальные без дублей при повторном запуске). */
export const DEFAULT_CONTENT_DRAFT_TYPES: ContentDraftType[] = [
  "telegram_post",
  "vk_post",
  "blog_post",
  "site_announce",
];
