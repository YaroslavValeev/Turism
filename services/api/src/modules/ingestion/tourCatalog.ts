/**
 * ИИ-сборщик каталогов турфирм: главная → ссылки на страницы туров → тур из каждой страницы.
 * Здесь только чистые функции (ссылки, текст, промпты, разбор ответа ИИ) — сеть и БД в tourCatalog.service.ts.
 */
import { formatSeasonMonthsRu, seasonWindow, yearRoundWindow } from "../programs/onRequestSchedule";

export const AI_TOUR_PAYLOAD_MODE = "ai_tour_v1";

export const TOUR_DISCIPLINES = [
  "trekking",
  "expedition",
  "freeride",
  "heli-ski",
  "ski",
  "ski-tour",
  "snowboard",
  "snowmobile",
  "backcountry",
  "mtb",
  "sup",
  "surf",
  "kite",
  "wakesurf",
  "sailing",
  "wildlife",
] as const;

export type TourLink = { url: string; text: string };

export type ExtractedTour = {
  title: string;
  discipline: string;
  region: string;
  location: string | null;
  durationDays: number | null;
  priceFrom: number | null;
  currency: string | null;
  /** fixed — есть конкретные даты заездов; on_request — сезон или «по запросу». */
  scheduleType: "fixed" | "on_request";
  startDate: string | null;
  endDate: string | null;
  seasonFromMonth: number | null;
  seasonToMonth: number | null;
  yearRound: boolean;
  level: string | null;
  summary: string;
  audience: string | null;
  inclusions: string[];
  exclusions: string[];
  itinerary: string | null;
};

const SKIP_PATH_RE =
  /(contact|kontakt|about|o-nas|o_nas|company|news|novosti|blog|stat[ia]|article|review|otzyv|faq|vopros|policy|privacy|politika|oferta|dogovor|agreement|cart|korzina|login|signup|register|account|lk\/|search|tag\/|category\/|wp-|feed|sitemap|vacanc|vakans|partner|gallery|galereya|foto|photo|video|press|team|komanda|gid[ыi]?\/?$|guides?\/?$|payment|oplata|insurance|strahov)/i;
const ASSET_RE = /\.(jpe?g|png|gif|webp|svg|pdf|docx?|xlsx?|zip|mp4|mp3)(?:$|\?)/i;

function hostKey(host: string): string {
  return host.toLowerCase().replace(/^www\./, "");
}

export function decodeEntities(value: string): string {
  return value
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&laquo;/gi, "«")
    .replace(/&raquo;/gi, "»")
    .replace(/&mdash;/gi, "—")
    .replace(/&ndash;/gi, "–")
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n: string) => String.fromCodePoint(parseInt(n, 16)));
}

function cleanText(value: string): string {
  return decodeEntities(value.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
}

/** Ссылки того же сайта, похожие на страницы контента (без служебных разделов и файлов). */
export function extractSameSiteLinks(html: string, pageUrl: string, limit = 200): TourLink[] {
  let base: URL;
  try {
    base = new URL(pageUrl);
  } catch {
    return [];
  }
  const out = new Map<string, TourLink>();
  for (const m of html.matchAll(/<a\b[^>]*\bhref\s*=\s*["']([^"'#]+)[^"']*["'][^>]*>([\s\S]*?)<\/a>/gi)) {
    let url: URL;
    try {
      url = new URL(decodeEntities(m[1].trim()), base);
    } catch {
      continue;
    }
    if (url.protocol !== "http:" && url.protocol !== "https:") continue;
    if (hostKey(url.hostname) !== hostKey(base.hostname)) continue;
    url.hash = "";
    const path = url.pathname.replace(/\/+$/, "");
    if (!path || path === "/" || ASSET_RE.test(path) || SKIP_PATH_RE.test(path)) continue;
    const key = `${hostKey(url.hostname)}${path}${url.search}`;
    const text = cleanText(m[2]).slice(0, 120);
    const existing = out.get(key);
    if (existing) {
      if (!existing.text && text) existing.text = text;
      continue;
    }
    out.set(key, { url: url.toString(), text });
    if (out.size >= limit) break;
  }
  return [...out.values()];
}

/** Видимый текст страницы без скриптов, стилей, меню и подвала. */
export function htmlToPlainText(html: string, maxLength = 9000): string {
  const body = html
    .replace(/<(script|style|noscript|svg|iframe|template)\b[\s\S]*?<\/\1>/gi, " ")
    .replace(/<(nav|footer|header)\b[\s\S]*?<\/\1>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|h[1-6]|tr|section|article)>/gi, "\n");
  const text = decodeEntities(body.replace(/<[^>]+>/g, " "))
    .split("\n")
    .map((line) => line.replace(/[ \t\u00a0]+/g, " ").trim())
    .filter(Boolean)
    .join("\n");
  return text.length > maxLength ? text.slice(0, maxLength) : text;
}

function absoluteHttpUrl(raw: string, pageUrl: string): string | null {
  try {
    const url = new URL(decodeEntities(raw.trim()), pageUrl);
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : null;
  } catch {
    return null;
  }
}

const CONTENT_IMAGE_RE = /\.(jpe?g|png|webp)(?:$|\?)/i;
const DECOR_IMAGE_RE = /(logo|icon|sprite|avatar|favicon|placeholder|blank|pixel|banner-small|flag|payment|visa|mastercard)/i;

/** og:image / twitter:image, иначе первая содержательная картинка из тела страницы (не логотип и не иконка). */
export function extractPageImage(html: string, pageUrl: string): string | null {
  const m =
    html.match(/<meta[^>]+property=["']og:image(?::url)?["'][^>]+content=["']([^"']+)["']/i) ??
    html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image(?::url)?["']/i) ??
    html.match(/<meta[^>]+name=["']twitter:image["'][^>]+content=["']([^"']+)["']/i);
  if (m) return absoluteHttpUrl(m[1], pageUrl);
  const body = html.replace(/<(header|nav|footer)\b[\s\S]*?<\/\1>/gi, " ");
  for (const img of body.matchAll(/<img\b[^>]*>/gi)) {
    const src = img[0].match(/\b(?:data-src|data-lazy-src|data-original|src)\s*=\s*["']([^"']+)["']/i)?.[1];
    if (!src || !CONTENT_IMAGE_RE.test(src) || DECOR_IMAGE_RE.test(src)) continue;
    const url = absoluteHttpUrl(src, pageUrl);
    if (url) return url;
  }
  return null;
}

export function extractPageTitle(html: string): string | null {
  const m = html.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i) ?? html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i);
  const t = m ? cleanText(m[1]) : "";
  return t || null;
}

export const LINK_PICK_SYSTEM_PROMPT = [
  "Ты помогаешь агрегатору активных туров MyWaveTour разобрать сайт турфирмы.",
  "Тебе дан список ссылок сайта (адрес и текст ссылки).",
  "Выбери ТОЛЬКО ссылки на страницы отдельных туров/программ/маршрутов (одна страница — один тур).",
  "Не выбирай: разделы-каталоги со списком туров, новости, статьи, отзывы, контакты, оплату, галереи, страницы гидов, экскурсии на пару часов, трансферы, аренду, проживание без программы.",
  'Верни ТОЛЬКО JSON: {"tours": ["<url>", ...], "catalogPages": ["<url>", ...]}.',
  "catalogPages — до 3 страниц-каталогов, где перечислены туры (если туров на главной мало). Используй только адреса из списка.",
].join("\n");

export function buildLinkPickUserMessage(siteName: string, siteUrl: string, links: TourLink[]): string {
  const lines = links.map((l) => `${l.url} | ${l.text || "—"}`);
  return `Сайт: ${siteName} (${siteUrl})\nСсылки:\n${lines.join("\n")}`;
}

function stringList(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : [];
}

/** Оставляет только адреса из исходного списка — ИИ не может подсунуть чужой сайт. */
export function parsePickedLinks(json: unknown, links: TourLink[]): { tours: string[]; catalogPages: string[] } {
  const known = new Map(links.map((l) => [l.url.replace(/\/+$/, ""), l.url]));
  const pick = (value: unknown) => {
    const out: string[] = [];
    for (const raw of stringList(value)) {
      const url = known.get(raw.trim().replace(/\/+$/, ""));
      if (url && !out.includes(url)) out.push(url);
    }
    return out;
  };
  const obj = json && typeof json === "object" ? (json as Record<string, unknown>) : {};
  return { tours: pick(obj.tours), catalogPages: pick(obj.catalogPages).slice(0, 3) };
}

export const TOUR_EXTRACT_SYSTEM_PROMPT = [
  "Ты извлекаешь из страницы сайта турфирмы карточку одного тура для агрегатора активных туров MyWaveTour.",
  "Пиши по-русски, только факты со страницы, ничего не выдумывай. Если поля нет на странице — null или пустой список.",
  "Если страница не описывает конкретный многодневный или однодневный активный тур (это каталог, статья, экскурсия по городу, трансфер, аренда, проживание) — isTour=false.",
  `discipline — одно из: ${TOUR_DISCIPLINES.join(", ")}. Пеший поход/восхождение/треккинг → trekking; сплав/морская прогулка с наблюдением животных → wildlife; многодневное путешествие на внедорожниках/вертолёте по региону → expedition.`,
  "region — регион России или страна по-русски (например «Камчатка», «Алтай», «Мурманская область»). location — конкретное место (вулкан, озеро, посёлок) или null.",
  "scheduleType: fixed — если на странице есть конкретные даты заездов (тогда startDate/endDate ближайшего будущего заезда в формате YYYY-MM-DD); on_request — если дат нет, тур проводится по запросу или в сезон.",
  "Для on_request укажи seasonFromMonth/seasonToMonth (1–12), если сезон назван (например «июнь–сентябрь» → 6 и 9), или yearRound=true, если круглый год.",
  "durationDays — длительность тура в днях (число). priceFrom — минимальная цена за человека числом, currency — RUB/USD/EUR/KZT.",
  "level — beginner | intermediate | advanced | all_levels или null.",
  "summary — 1–2 предложения, о чём тур. audience — для кого (1–2 предложения) или null.",
  "inclusions/exclusions — короткие пункты «входит»/«не входит» (до 8 каждого). itinerary — краткая программа по дням (до 1200 символов) или null.",
  'Верни ТОЛЬКО JSON: {"isTour": boolean, "title": string, "discipline": string, "region": string, "location": string|null, "durationDays": number|null, "priceFrom": number|null, "currency": string|null, "scheduleType": "fixed"|"on_request", "startDate": string|null, "endDate": string|null, "seasonFromMonth": number|null, "seasonToMonth": number|null, "yearRound": boolean, "level": string|null, "summary": string, "audience": string|null, "inclusions": string[], "exclusions": string[], "itinerary": string|null}',
].join("\n");

export function buildTourExtractUserMessage(siteName: string, url: string, title: string | null, text: string): string {
  return `Организатор: ${siteName}\nСтраница: ${url}\nЗаголовок: ${title ?? "—"}\n\nТекст страницы:\n${text}`;
}

function str(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  const v = value.replace(/\s+/g, " ").trim();
  if (!v || /^(null|unknown|n\/a|—|-)$/i.test(v)) return null;
  return v.slice(0, max);
}

function int(value: unknown, min: number, max: number): number | null {
  const n = typeof value === "string" ? Number(value.replace(/[^\d.]/g, "")) : typeof value === "number" ? value : NaN;
  if (!Number.isFinite(n)) return null;
  const r = Math.round(n);
  return r >= min && r <= max ? r : null;
}

function isoDate(value: unknown): string | null {
  const v = str(value, 10);
  if (!v || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return null;
  return Number.isNaN(Date.parse(`${v}T12:00:00Z`)) ? null : v;
}

function items(value: unknown, max: number): string[] {
  return stringList(value)
    .map((s) => str(s, 200))
    .filter((s): s is string => Boolean(s))
    .slice(0, max);
}

/** Строгая проверка ответа ИИ: без названия, региона или признака тура — null. */
export function parseExtractedTour(json: unknown): ExtractedTour | null {
  if (!json || typeof json !== "object") return null;
  const o = json as Record<string, unknown>;
  if (o.isTour !== true) return null;
  const title = str(o.title, 160);
  const region = str(o.region, 80);
  if (!title || !region) return null;
  const discipline = str(o.discipline, 30)?.toLowerCase() ?? "";
  const startDate = isoDate(o.startDate);
  const endDate = isoDate(o.endDate) ?? startDate;
  const fixed = o.scheduleType === "fixed" && Boolean(startDate);
  const currency = str(o.currency, 3)?.toUpperCase() ?? null;
  const level = str(o.level, 20);
  return {
    title,
    discipline: (TOUR_DISCIPLINES as readonly string[]).includes(discipline) ? discipline : "trekking",
    region,
    location: str(o.location, 120),
    durationDays: int(o.durationDays, 1, 60),
    priceFrom: int(o.priceFrom, 100, 50_000_000),
    currency: currency && ["RUB", "USD", "EUR", "KZT"].includes(currency) ? currency : null,
    scheduleType: fixed ? "fixed" : "on_request",
    startDate: fixed ? startDate : null,
    endDate: fixed ? endDate : null,
    seasonFromMonth: int(o.seasonFromMonth, 1, 12),
    seasonToMonth: int(o.seasonToMonth, 1, 12),
    yearRound: o.yearRound === true,
    level: level && ["beginner", "intermediate", "advanced", "all_levels"].includes(level) ? level : null,
    summary: str(o.summary, 400) ?? title,
    audience: str(o.audience, 400),
    inclusions: items(o.inclusions, 8),
    exclusions: items(o.exclusions, 8),
    itinerary: typeof o.itinerary === "string" ? o.itinerary.trim().slice(0, 1200) || null : null,
  };
}

export type AiTourNormalizedFields = {
  title: string;
  discipline: string;
  region: string;
  city: string | null;
  startDate: Date;
  endDate: Date;
  durationDays: number | null;
  level: string | null;
  priceFrom: number | null;
  currency: string | null;
  descriptionShort: string;
  descriptionFull: string;
  scheduleType: "fixed" | "on_request";
  seasonLabel: string | null;
  suggestedInclusions: string | null;
};

function dayDiff(start: Date, end: Date): number {
  return Math.round((end.getTime() - start.getTime()) / 86_400_000) + 1;
}

/** Сезон покрывает все 12 месяцев (январь–декабрь, март–февраль). */
function coversWholeYear(from: number, to: number): boolean {
  return (to - from + 12) % 12 === 11;
}

/** Дальше этой длины «фиксированный» диапазон — это сезон, а не даты заезда. */
const MAX_FIXED_SPAN_DAYS = 45;

/**
 * Тур с сайта → поля нормализованного элемента. У тура «по запросу» в даты кладётся окно сезона
 * (круглый год, если сезон не назван), а durationDays остаётся длительностью самого тура.
 */
export function aiTourToNormalizedFields(tour: ExtractedTour, now = new Date()): AiTourNormalizedFields {
  let startDate: Date;
  let endDate: Date;
  let seasonLabel: string | null = null;
  let seasonFrom = tour.seasonFromMonth;
  let seasonTo = tour.seasonToMonth;
  let fixedStart: Date | null = null;
  let fixedEnd: Date | null = null;
  if (tour.scheduleType === "fixed" && tour.startDate) {
    fixedStart = new Date(`${tour.startDate}T12:00:00Z`);
    fixedEnd = new Date(`${tour.endDate ?? tour.startDate}T12:00:00Z`);
    if (fixedEnd < fixedStart) fixedEnd = fixedStart;
    const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
    // Прошедший заезд или диапазон длиной в сезон — это расписание сезона, а не ближайшая дата.
    // Одиночная дата 1-го числа — модель так записывает «с декабря», это не дата заезда.
    const monthMarker = fixedStart.getUTCDate() === 1 && fixedEnd.getTime() === fixedStart.getTime();
    if (fixedEnd.getTime() < today || dayDiff(fixedStart, fixedEnd) > MAX_FIXED_SPAN_DAYS || monthMarker) {
      seasonFrom = fixedStart.getUTCMonth() + 1;
      seasonTo = fixedEnd.getUTCMonth() + 1;
      fixedStart = null;
      fixedEnd = null;
    }
  }
  if (fixedStart && fixedEnd) {
    startDate = fixedStart;
    endDate = fixedEnd;
  } else if (!tour.yearRound && seasonFrom && seasonTo && !coversWholeYear(seasonFrom, seasonTo)) {
    ({ startDate, endDate } = seasonWindow(seasonFrom, seasonTo, now));
    seasonLabel = formatSeasonMonthsRu(seasonFrom, seasonTo);
  } else {
    ({ startDate, endDate } = yearRoundWindow(now));
    seasonLabel = "круглый год";
  }
  const fixed = seasonLabel === null;
  const descriptionFull = [tour.summary, tour.itinerary].filter(Boolean).join("\n\n");
  const durationDays = tour.durationDays ?? (fixed ? dayDiff(startDate, endDate) : null);
  return {
    title: tour.title,
    discipline: tour.discipline,
    region: tour.region,
    city: tour.location,
    startDate,
    endDate,
    durationDays,
    level: tour.level,
    priceFrom: tour.priceFrom,
    currency: tour.priceFrom != null ? tour.currency ?? "RUB" : null,
    descriptionShort: tour.audience ?? tour.summary,
    descriptionFull,
    scheduleType: fixed ? "fixed" : "on_request",
    seasonLabel,
    suggestedInclusions: tour.inclusions.length ? tour.inclusions.join("\n") : null,
  };
}

/** Стабильный текст тура для RawItem (входит в contentHash) — только извлечённые факты. */
export function aiTourRawText(tour: ExtractedTour): string {
  return [
    tour.summary,
    tour.audience ? `Для кого: ${tour.audience}` : null,
    tour.itinerary ? `Программа:\n${tour.itinerary}` : null,
    tour.inclusions.length ? `Входит:\n${tour.inclusions.map((s) => `- ${s}`).join("\n")}` : null,
    tour.exclusions.length ? `Не входит:\n${tour.exclusions.map((s) => `- ${s}`).join("\n")}` : null,
  ]
    .filter(Boolean)
    .join("\n\n");
}

const TITLE_STOP = new Set(["тур", "туры", "по", "на", "в", "и", "с", "к", "из", "для", "дней", "дня", "день", "ночей"]);

function titleTokens(title: string): Set<string> {
  return new Set(
    title
      .toLowerCase()
      .replace(/ё/g, "е")
      .split(/[^a-zа-я0-9]+/i)
      .filter((t) => t.length > 2 && !TITLE_STOP.has(t))
      .map((t) => t.slice(0, 6)),
  );
}

/**
 * Сходство названий 0–1 по основам слов (Жаккар): «Восхождение на Авачинский вулкан» ≈ «Авачинский вулкан: восхождение»,
 * но «Заброски на Мутновский вулкан снегоходом» ≠ «Заброски на Горелый вулкан снегоходом».
 */
export function titleSimilarity(a: string, b: string): number {
  const ta = titleTokens(a);
  const tb = titleTokens(b);
  if (!ta.size || !tb.size) return 0;
  let common = 0;
  for (const t of ta) if (tb.has(t)) common += 1;
  return common / (ta.size + tb.size - common);
}

export const DUPLICATE_TITLE_SIMILARITY = 0.7;

/** Один и тот же тур: почти одинаковое название и та же длительность (если она известна у обоих). */
export function isLikelySameTour(
  a: { title: string; durationDays: number | null },
  b: { title: string; durationDays: number | null },
): boolean {
  if (a.durationDays && b.durationDays && a.durationDays !== b.durationDays) return false;
  return titleSimilarity(a.title, b.title) >= DUPLICATE_TITLE_SIMILARITY;
}
