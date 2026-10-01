/**
 * Sprint 4: продуктовые шаблоны уведомлений о публикации программы (Telegram HTML + email HTML/text).
 * Telegram (Visual System v1): блок без данных скрывается целиком, заглушек нет; цена/уровень/риск — только из карточки.
 * Email: нейтральные фразы при отсутствии копирайта в БД.
 */

import { formatMoney } from "../fx/cbrRates";
import { formatOnRequestLabel, isOnRequestSchedule } from "../programs/onRequestSchedule";

export type ProgramNotifySource = {
  id: string;
  title: string;
  discipline: string;
  region: string;
  location?: string | null;
  startDate: Date;
  endDate?: Date | null;
  durationDays?: number | null;
  scheduleType?: string | null;
  seasonLabel?: string | null;
  audienceFit?: string | null;
  inclusions?: string | null;
  organizerName?: string | null;
  organizerDisplayName?: string | null;
  levelRequired?: string | null;
  riskLevel?: string | null;
  priceFrom?: number | null;
  currency?: string | null;
  formatType?: string | null;
  cancellationRules?: string | null;
  whatHappensAfterBooking?: string | null;
  medicalLimitations?: string | null;
  /** Поля, подтверждённые оператором вручную (Program.manualFields). */
  manualFields?: string[] | null;
};

const FB = {
  forWho: "Подойдёт тем, кто ищет выезд под свои даты и уровень — детали на карточке.",
  benefits: "На карточке — формат, уровень и что включено в программу.",
  organizer: "Организатор указан на странице программы.",
  important: "Условия отмены и безопасность — на карточке перед заявкой.",
  contextLine: "Новый выезд в каталоге MyWaveTour.",
} as const;

function pickFirstNonempty(...vals: Array<string | null | undefined>): string | null {
  for (const v of vals) {
    const t = v?.trim();
    if (t) return t;
  }
  return null;
}

function truncateOneLine(s: string, max: number): string {
  const one = s.replace(/\s+/g, " ").trim();
  if (one.length <= max) return one;
  return `${one.slice(0, max - 1)}…`;
}

/** Разбить текст на буллеты (строки или фрагменты по `;`). */
export function bulletsFromFreeText(text: string | null | undefined, maxBullets: number, maxEach: number): string[] {
  if (!text?.trim()) return [];
  const parts = text
    .split(/\n+|;/g)
    .map((p) => p.trim())
    .filter(Boolean);
  const out: string[] = [];
  for (const p of parts) {
    if (out.length >= maxBullets) break;
    out.push(truncateOneLine(p, maxEach));
  }
  return out;
}

export function escapeTelegramHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

const MONTHS_GENITIVE = [
  "января",
  "февраля",
  "марта",
  "апреля",
  "мая",
  "июня",
  "июля",
  "августа",
  "сентября",
  "октября",
  "ноября",
  "декабря",
];

/** «27 сентября — 3 октября 2026», «1–10 октября 2026», «28 декабря 2026 — 4 января 2027». Даты в UTC, как в каталоге. */
export function formatDateRangeRu(startDate: Date, endDate?: Date | null): string {
  const s = new Date(startDate);
  const e = endDate ? new Date(endDate) : null;
  const day = (d: Date) => d.getUTCDate();
  const month = (d: Date) => MONTHS_GENITIVE[d.getUTCMonth()];
  const year = (d: Date) => d.getUTCFullYear();
  if (!e || e.toISOString().slice(0, 10) === s.toISOString().slice(0, 10)) {
    return `${day(s)} ${month(s)} ${year(s)}`;
  }
  if (year(s) !== year(e)) return `${day(s)} ${month(s)} ${year(s)} — ${day(e)} ${month(e)} ${year(e)}`;
  if (s.getUTCMonth() !== e.getUTCMonth()) return `${day(s)} ${month(s)} — ${day(e)} ${month(e)} ${year(e)}`;
  return `${day(s)}–${day(e)} ${month(e)} ${year(e)}`;
}

function daysWord(n: number): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return "день";
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return "дня";
  return "дней";
}

export function durationLabel(startDate: Date, endDate?: Date | null): string | null {
  if (!endDate) return null;
  const days = Math.round((new Date(endDate).getTime() - new Date(startDate).getTime()) / 86_400_000) + 1;
  return days > 1 ? `${days} ${daysWord(days)}` : null;
}

function meaningful(value: string | null | undefined): string | null {
  const v = value?.trim();
  if (!v || /^(unknown|n\/a|none|null|—|-)$/i.test(v)) return null;
  return v;
}

/** Служебные организаторы-заготовки («Ручной ввод (бот владельца)») — не имя, которое можно показать гостю. */
export function isPlaceholderOrganizerName(name: string | null | undefined): boolean {
  const v = meaningful(name);
  return !v || /^ручной ввод/i.test(v);
}

/** Ингест пишет дисциплину и страну латиницей; в русскоязычном посте показываем по-русски. Неизвестное — как есть. */
const DISCIPLINE_RU: Record<string, string> = {
  freeride: "Фрирайд",
  wakesurf: "Вейксерф",
  wakeboard: "Вейкборд",
  kite: "Кайт",
  kitesurf: "Кайтсерфинг",
  sup: "SUP",
  surf: "Сёрфинг",
  enduro: "Эндуро",
  mtb: "МТБ",
  snowboard: "Сноуборд",
  ski: "Горные лыжи",
  skitour: "Скитур",
  climbing: "Скалолазание",
};

const PLACE_RU: Record<string, string> = {
  russia: "Россия",
  krasnodar: "Краснодар",
  kazakhstan: "Казахстан",
  georgia: "Грузия",
  egypt: "Египет",
  turkey: "Турция",
  chile: "Чили",
};

function ru(map: Record<string, string>, value: string | null): string | null {
  return value ? (map[value.toLowerCase()] ?? value) : null;
}

function placeLine(src: ProgramNotifySource): string | null {
  const parts: string[] = [];
  for (const p of [ru(PLACE_RU, meaningful(src.location)), ru(PLACE_RU, meaningful(src.region))]) {
    if (p && !parts.some((kept) => kept.toLowerCase() === p.toLowerCase())) parts.push(p);
  }
  const discipline = ru(DISCIPLINE_RU, meaningful(src.discipline));
  const place = parts.join(", ");
  return [place, discipline].filter(Boolean).join(" · ") || null;
}

/** У тура по запросу в датах лежит окно сезона, поэтому длительность берётся из durationDays. */
function scheduleSummary(src: ProgramNotifySource): { when: string; duration: string | null } {
  if (isOnRequestSchedule(src.scheduleType)) {
    const days = src.durationDays ?? 0;
    return { when: formatOnRequestLabel(src.seasonLabel), duration: days > 1 ? `${days} ${daysWord(days)}` : null };
  }
  return { when: formatDateRangeRu(src.startDate, src.endDate), duration: durationLabel(src.startDate, src.endDate) };
}

export function formatProgramContextLine(src: ProgramNotifySource, locale = "ru-RU"): string {
  if (isOnRequestSchedule(src.scheduleType)) {
    return `${escapeTelegramHtml(src.discipline)} · ${escapeTelegramHtml(src.region)} · ${escapeTelegramHtml(formatOnRequestLabel(src.seasonLabel))}`;
  }
  const start = new Date(src.startDate).toLocaleDateString(locale);
  const end = src.endDate ? new Date(src.endDate).toLocaleDateString(locale) : null;
  const datePart = end && end !== start ? `${start} — ${end}` : start;
  return `${escapeTelegramHtml(src.discipline)} · ${escapeTelegramHtml(src.region)} · старт ${escapeTelegramHtml(datePart)}`;
}

function levelHint(src: ProgramNotifySource): string | null {
  const lv = src.levelRequired?.trim();
  if (!lv) return null;
  return `Уровень: ${lv}`;
}

const LEVEL_LABELS: Record<string, string> = {
  beginner: "для новичков",
  intermediate: "средний",
  advanced: "продвинутый",
  expert: "эксперт",
};

const RISK_LABELS: Record<string, string> = {
  low: "низкий",
  medium: "средний",
  high: "высокий",
  extreme: "экстремальный",
};

function labelOf(map: Record<string, string>, raw: string | null | undefined): string | null {
  const v = meaningful(raw);
  if (!v) return null;
  return map[v.toLowerCase()] ?? null;
}

/**
 * Ингест ставит riskLevel="medium" и levelRequired="all_levels" по умолчанию, а в тексты — служебные заготовки.
 * Это не данные организатора: в пост они не попадают (канон запрещает выдуманные параметры).
 */
const INGEST_PLACEHOLDER_RE =
  /^(Требует ручно(й|го) (нормализации|заполнения)|Базовая программа и сопровождение организатора|После заявки оператор уточняет детали)/i;

export function isIngestPlaceholderText(text: string | null | undefined): boolean {
  return INGEST_PLACEHOLDER_RE.test(text?.trim() ?? "");
}

function confirmedRisk(src: ProgramNotifySource): string | null {
  const v = meaningful(src.riskLevel)?.toLowerCase();
  if (!v) return null;
  const operatorSet = src.manualFields?.includes("riskLevel") ?? false;
  return operatorSet || v === "high" || v === "extreme" ? labelOf(RISK_LABELS, v) : null;
}

/** «Уровень: средний · Риск: высокий · от 185 000 ₽» — только поля, реально заполненные в карточке. */
export function telegramParamsLine(src: ProgramNotifySource): string | null {
  const level = labelOf(LEVEL_LABELS, src.levelRequired);
  const risk = confirmedRisk(src);
  const price = src.priceFrom != null && src.priceFrom > 0 ? `от ${formatMoney(src.priceFrom, src.currency)}` : null;
  const parts = [
    level ? `Уровень: ${escapeTelegramHtml(level)}` : null,
    risk ? `Риск: ${escapeTelegramHtml(risk)}` : null,
    price ? `<b>${escapeTelegramHtml(price)}</b>` : null,
  ].filter(Boolean);
  return parts.length ? parts.join(" · ") : null;
}

function buildForWhoBullets(src: ProgramNotifySource, options?: { includeLevel?: boolean; fallback?: boolean }): string[] {
  const skipPlaceholder = options?.fallback === false && isIngestPlaceholderText(src.audienceFit);
  const fromAudience = skipPlaceholder ? [] : bulletsFromFreeText(src.audienceFit, 3, 200);
  if (fromAudience.length) return fromAudience;
  const out: string[] = [];
  const fmt = src.formatType?.trim();
  if (fmt) out.push(`Формат: ${truncateOneLine(fmt, 100)}`);
  const lv = options?.includeLevel === false ? null : levelHint(src);
  if (lv) out.push(lv);
  if (out.length) return out.slice(0, 3);
  return options?.fallback === false ? [] : [FB.forWho];
}

function buildBenefitBullets(src: ProgramNotifySource, options?: { fallback?: boolean }): string[] {
  const skipPlaceholder = options?.fallback === false && isIngestPlaceholderText(src.inclusions);
  const fromInc = skipPlaceholder ? [] : bulletsFromFreeText(src.inclusions, 3, 160);
  if (fromInc.length) return fromInc;
  const wh = bulletsFromFreeText(src.whatHappensAfterBooking, 2, 120).filter(
    (b) => options?.fallback !== false || !isIngestPlaceholderText(b),
  );
  if (wh.length) return wh;
  return options?.fallback === false ? [] : [FB.benefits];
}

function buildImportantBlock(src: ProgramNotifySource): string | null {
  const parts = [
    ...bulletsFromFreeText(src.cancellationRules, 2, 140),
    ...bulletsFromFreeText(src.medicalLimitations, 2, 140),
  ]
    .filter((p) => !isIngestPlaceholderText(p))
    .slice(0, 3);
  if (parts.length) return parts.map((p) => `• ${p}`).join("\n");
  return null;
}

function organizerLine(src: ProgramNotifySource): string | null {
  const name = pickFirstNonempty(src.organizerDisplayName, src.organizerName);
  return isPlaceholderOrganizerName(name) ? null : name;
}

/** Что реально происходит после клика: форма заявки на сайте, ответ организатора или команды MyWaveTour. */
export const TELEGRAM_CHANNEL_HOW_TO_BOOK =
  "<b>Как записаться</b>\n" +
  "Нажмите «Оставить заявку» под постом — организатор или команда MyWaveTour свяжется и подтвердит даты. " +
  "Оплата напрямую организатору.";

/** Для подписи к фото (лимит Telegram 1024 символа). */
export const TELEGRAM_CHANNEL_HOW_TO_BOOK_SHORT =
  "<b>Как записаться</b>\n«Оставить заявку» под постом. Ответит организатор или команда MyWaveTour, оплата — напрямую организатору.";

/** Telegram: HTML + короткая продуктовая структура. `compact` — вариант, помещающийся в подпись к фото. */
export function buildTelegramProgramNotifyHtml(
  src: ProgramNotifySource,
  programUrl: string | null,
  options?: { hideLinkFallbackHint?: boolean; includeCtaLinkInBody?: boolean; compact?: boolean },
): string {
  const compact = options?.compact ?? false;
  const title = escapeTelegramHtml(truncateOneLine(src.title, 180));
  const schedule = scheduleSummary(src);
  const dateLine = `📅 <b>${escapeTelegramHtml(schedule.when)}</b>${schedule.duration ? ` · ${schedule.duration}` : ""}`;
  const place = placeLine(src);
  const placeRow = place ? `\n📍 ${escapeTelegramHtml(place)}` : "";
  const params = telegramParamsLine(src);
  const paramsRow = params ? `\n${params}` : "";
  const bulletOpts = { includeLevel: false, fallback: false } as const;
  const forWhoAll = buildForWhoBullets(src, bulletOpts);
  const benefitAll = buildBenefitBullets(src, bulletOpts);
  const capitalize = (b: string) => b.charAt(0).toLocaleUpperCase("ru-RU") + b.slice(1);
  const forWhoItems = (compact ? forWhoAll.slice(0, 2).map((b) => truncateOneLine(b, 150)) : forWhoAll).map(capitalize);
  const benefitItems = (compact ? benefitAll.map((b) => truncateOneLine(b, 100)) : benefitAll).map(capitalize);
  const forWhoBlock = forWhoItems.length
    ? `<b>Для кого</b>\n${forWhoItems.map((b) => `• ${escapeTelegramHtml(b)}`).join("\n")}\n\n`
    : "";
  const benefitsBlock = benefitItems.length
    ? `<b>Что входит</b>\n${benefitItems.map((b) => `• ${escapeTelegramHtml(b)}`).join("\n")}\n\n`
    : "";
  // Имя организатора только в первой строке («Новый вызов от …»); отдельный блок его дублировал.
  const org = organizerLine(src);
  const impRaw = buildImportantBlock(src);
  const impBlock = impRaw ? `<b>Перед бронированием</b>\n${escapeTelegramHtml(impRaw)}` : "";

  const includeCtaLinkInBody = options?.includeCtaLinkInBody ?? true;
  const urlLine =
    includeCtaLinkInBody && programUrl && /^https?:\/\//i.test(programUrl)
      ? `\n<a href="${escapeTelegramHtml(programUrl)}">Открыть карточку и оставить заявку</a>`
      : options?.hideLinkFallbackHint
        ? ""
        : `\n<i>Откройте программу в приложении MyWaveTour по ссылке из письма или сайта.</i>`;

  const header = org
    ? `<i>Новый вызов от ${escapeTelegramHtml(truncateOneLine(org, 80))}</i>`
    : `<i>Новый вызов в MyWaveTour</i>`;

  const body =
    `${header}\n\n` +
    `<b>${title}</b>\n\n` +
    `${dateLine}${placeRow}${paramsRow}\n\n` +
    `${forWhoBlock}` +
    `${benefitsBlock}` +
    `${impBlock}`;
  return body.trimEnd() + urlLine;
}

/**
 * Пост в канал. С фото текст обязан уместиться в подпись (`captionLimit`), иначе фото и текст
 * уходят разными сообщениями — поэтому при переполнении берём компактный вариант.
 */
export function buildTelegramChannelPostHtml(
  src: ProgramNotifySource,
  fit?: { captionLimit: number; measure: (html: string) => number },
): string {
  const opts = { hideLinkFallbackHint: true, includeCtaLinkInBody: false };
  const full = `${buildTelegramProgramNotifyHtml(src, null, opts)}\n\n${TELEGRAM_CHANNEL_HOW_TO_BOOK}`;
  if (!fit || fit.measure(full) <= fit.captionLimit) return full;
  return `${buildTelegramProgramNotifyHtml(src, null, { ...opts, compact: true })}\n\n${TELEGRAM_CHANNEL_HOW_TO_BOOK_SHORT}`;
}

function emailSection(title: string, bodyHtml: string): string {
  return `<div style="margin:16px 0 0 0;"><div style="font-size:13px;font-weight:600;color:#111;margin-bottom:6px;">${title}</div><div style="font-size:15px;line-height:1.45;color:#333;">${bodyHtml}</div></div>`;
}

function emailBulletsHtml(items: string[]): string {
  return `<ul style="margin:8px 0;padding-left:20px;">${items.map((t) => `<li style="margin:4px 0;">${escapeHtml(t)}</li>`).join("")}</ul>`;
}

export function buildEmailProgramNotifyHtml(
  src: ProgramNotifySource,
  programUrl: string,
  unsubscribeUrl: string,
): string {
  const title = escapeHtml(truncateOneLine(src.title, 200));
  const sub = formatProgramContextLine(src);

  const forWhoHtml = emailBulletsHtml(buildForWhoBullets(src));
  const benefitsHtml = emailBulletsHtml(buildBenefitBullets(src));
  const org = organizerLine(src);
  const orgHtml = org
    ? emailSection("Кто проводит", `<p style="margin:0;">${escapeHtml(truncateOneLine(org, 200))}</p>`)
    : emailSection("Кто проводит", `<p style="margin:0;">${escapeHtml(FB.organizer)}</p>`);

  const imp = buildImportantBlock(src);
  const importantHtml = imp
    ? emailSection("Что важно знать", `<p style="margin:0;white-space:pre-line;">${escapeHtml(imp)}</p>`)
    : emailSection("Что важно знать", `<p style="margin:0;">${escapeHtml(FB.important)}</p>`);

  const safeProgramUrl = escapeHtml(programUrl);
  const safeUnsub = escapeHtml(unsubscribeUrl);

  return `<!DOCTYPE html><html><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/></head>
<body style="margin:0;padding:0;background:#f4f5f7;">
  <div style="max-width:600px;margin:0 auto;padding:24px 16px;font-family:system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;">
    <div style="background:#fff;border-radius:14px;padding:22px 20px;box-shadow:0 1px 3px rgba(0,0,0,.06);">
      <div style="font-size:12px;letter-spacing:.04em;text-transform:uppercase;color:#5b6472;">MyWaveTour</div>
      <h1 style="font-size:22px;line-height:1.25;margin:10px 0 6px;color:#111;">${title}</h1>
      <p style="margin:0 0 8px;font-size:15px;color:#444;">${sub}</p>
      <p style="margin:0 0 16px;font-size:14px;color:#666;">${escapeHtml(FB.contextLine)}</p>
      ${emailSection("Кому подойдёт", forWhoHtml)}
      ${emailSection("Что ты получишь", benefitsHtml)}
      ${orgHtml}
      ${importantHtml}
      <div style="margin:28px 0 8px;text-align:left;">
        <a href="${safeProgramUrl}" style="display:inline-block;padding:14px 22px;background:#0f6ab8;color:#fff;text-decoration:none;border-radius:10px;font-weight:600;font-size:15px;">Открыть программу</a>
      </div>
      <hr style="border:none;border-top:1px solid #e6e8ec;margin:24px 0;"/>
      <p style="margin:0;font-size:12px;line-height:1.5;color:#888;">
        <a href="${safeUnsub}" style="color:#5b6472;">Отписаться от рассылки</a>
      </p>
    </div>
  </div>
</body></html>`;
}

/** Plaintext для multipart/alternative и почтовых клиентов без HTML. */
export function buildEmailProgramNotifyText(
  src: ProgramNotifySource,
  programUrl: string,
  unsubscribeUrl: string,
): string {
  const when = isOnRequestSchedule(src.scheduleType)
    ? formatOnRequestLabel(src.seasonLabel)
    : `старт ${new Date(src.startDate).toLocaleDateString("ru-RU")}`;
  const lines = [
    "MyWaveTour — новый выезд",
    src.title,
    `${src.discipline} · ${src.region} · ${when}`,
    "",
    FB.contextLine,
    "",
    "Кому подойдёт",
    ...buildForWhoBullets(src).map((b) => `• ${b}`),
    "",
    "Что ты получишь",
    ...buildBenefitBullets(src).map((b) => `• ${b}`),
    "",
    "Кто проводит",
    organizerLine(src) ?? FB.organizer,
    "",
    "Что важно знать",
    buildImportantBlock(src) ?? FB.important,
    "",
    `Открыть программу: ${programUrl}`,
    "",
    `Отписаться: ${unsubscribeUrl}`,
  ];
  return lines.join("\n");
}

/** Маппинг строки Program (+ опциональный organizer) в источник шаблонов. */
export function programRowToNotifySource(
  row: {
    id: string;
    title: string;
    discipline: string;
    region: string;
    exactLocation?: string | null;
    startDate: Date;
    endDate: Date;
    durationDays?: number | null;
    scheduleType?: string | null;
    seasonLabel?: string | null;
    audienceFit?: string | null;
    inclusions?: string | null;
    organizerName?: string | null;
    levelRequired?: string | null;
    riskLevel?: string | null;
    priceFromRub?: number | null;
    currency?: string | null;
    formatType?: string | null;
    cancellationRules?: string | null;
    whatHappensAfterBooking?: string | null;
    medicalLimitations?: string | null;
    manualFields?: string[] | null;
    organizer?: { displayName: string } | null;
  },
): ProgramNotifySource {
  return {
    id: row.id,
    title: row.title,
    discipline: row.discipline,
    region: row.region,
    location: row.exactLocation ?? null,
    startDate: row.startDate,
    endDate: row.endDate,
    durationDays: row.durationDays ?? null,
    scheduleType: row.scheduleType ?? null,
    seasonLabel: row.seasonLabel ?? null,
    audienceFit: row.audienceFit ?? null,
    inclusions: row.inclusions ?? null,
    organizerName: row.organizerName ?? null,
    organizerDisplayName: row.organizer?.displayName ?? null,
    levelRequired: row.levelRequired ?? null,
    riskLevel: row.riskLevel ?? null,
    priceFrom: row.priceFromRub ?? null,
    currency: row.currency ?? null,
    formatType: row.formatType ?? null,
    cancellationRules: row.cancellationRules ?? null,
    whatHappensAfterBooking: row.whatHappensAfterBooking ?? null,
    medicalLimitations: row.medicalLimitations ?? null,
    manualFields: row.manualFields ?? null,
  };
}
