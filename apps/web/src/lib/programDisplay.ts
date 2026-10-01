/**
 * Правила отображения данных программы на PDP.
 * Только presentation: значения не исправляются, невалидные — скрываются.
 */
import { ruPluralNoun } from "./ruPlural";

const TECHNICAL_EMPTY = new Set([
  "unknown",
  "undefined",
  "null",
  "nan",
  "n/a",
  "na",
  "none",
  "nil",
  "-",
  "—",
  "–",
]);

/** Строка для показа пользователю или null, если значения нет либо оно техническое (Unknown, null, NaN…). */
export function displayValue(value: unknown): string | null {
  if (value == null) return null;
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : null;
  if (typeof value !== "string") return null;
  const text = value.trim();
  if (!text) return null;
  if (TECHNICAL_EMPTY.has(text.toLowerCase())) return null;
  return text;
}

/**
 * Человекочитаемая подпись enum-значения. Если словарь не знает значение и вернул его как есть
 * (`some_enum`), считаем его техническим и не показываем.
 */
export function humanLabel(
  value: string | null | undefined,
  translate: (value: string) => string,
): string | null {
  const raw = displayValue(value);
  if (!raw) return null;
  const label = displayValue(translate(raw));
  if (!label) return null;
  if (label === raw && /^[a-z0-9]+(?:[_-][a-z0-9]+)*$/.test(raw)) return null;
  return label;
}

export function joinDisplayParts(parts: unknown[], separator = " · "): string | null {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of parts) {
    const text = displayValue(part);
    if (!text) continue;
    const key = text.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(text);
  }
  return out.length ? out.join(separator) : null;
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

const MONTHS_SHORT = ["янв", "фев", "мар", "апр", "мая", "июн", "июл", "авг", "сен", "окт", "ноя", "дек"];

type DateParts = { y: number; m: number; d: number };

/** Берёт календарную дату из `YYYY-MM-DD…` без учёта таймзоны — одинаково на сервере и в браузере. */
function parseIsoDate(value: string | null | undefined): DateParts | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(value ?? "").trim());
  if (!match) return null;
  const y = Number(match[1]);
  const m = Number(match[2]);
  const d = Number(match[3]);
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  return { y, m, d };
}

export function formatDateRu(value: string | null | undefined): string | null {
  const p = parseIsoDate(value);
  return p ? `${p.d} ${MONTHS_GENITIVE[p.m - 1]} ${p.y}` : null;
}

/**
 * «27 сентября — 3 октября 2026», «3 — 9 октября 2026», «28 декабря 2026 — 4 января 2027».
 * short: «27 сен — 3 окт» (без года, для мобильной панели).
 */
export function formatDateRangeRu(
  start: string | null | undefined,
  end: string | null | undefined,
  options: { short?: boolean } = {},
): string | null {
  const a = parseIsoDate(start);
  const b = parseIsoDate(end);
  if (!a) return null;
  const months = options.short ? MONTHS_SHORT : MONTHS_GENITIVE;
  const startLabel = (withMonth: boolean, withYear: boolean) =>
    `${a.d}${withMonth ? ` ${months[a.m - 1]}` : ""}${withYear ? ` ${a.y}` : ""}`;
  if (!b || (a.y === b.y && a.m === b.m && a.d === b.d)) {
    return startLabel(true, !options.short);
  }
  const endLabel = `${b.d} ${months[b.m - 1]}${options.short ? "" : ` ${b.y}`}`;
  if (a.y !== b.y) return `${startLabel(true, !options.short)} — ${endLabel}`;
  if (a.m === b.m) return `${startLabel(false, false)} — ${endLabel}`;
  return `${startLabel(true, false)} — ${endLabel}`;
}

/** «01.10.2026, 14:30 МСК» — Москва без перехода на летнее время (UTC+3), детерминированно. */
export function formatDateTimeMsk(value: string | null | undefined): string | null {
  const time = Date.parse(String(value ?? ""));
  if (!Number.isFinite(time)) return null;
  const msk = new Date(time + 3 * 60 * 60 * 1000);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(msk.getUTCDate())}.${pad(msk.getUTCMonth() + 1)}.${msk.getUTCFullYear()}, ${pad(msk.getUTCHours())}:${pad(msk.getUTCMinutes())} МСК`;
}

export function durationDaysLabel(days: number | null | undefined): string | null {
  if (typeof days !== "number" || !Number.isFinite(days) || days <= 0) return null;
  const n = Math.round(days);
  return `${n} ${ruPluralNoun(n, ["день", "дня", "дней"])}`;
}

export function reviewsCountLabel(count: number): string {
  return `${count} ${ruPluralNoun(count, ["отзыв", "отзыва", "отзывов"])}`;
}

/** Первые строки списка для краткой сводки + сколько осталось. */
export function summarizeLines(lines: string[], limit: number): { shown: string[]; rest: number } {
  const clean = lines.map((l) => displayValue(l)).filter((l): l is string => Boolean(l));
  return { shown: clean.slice(0, limit), rest: Math.max(0, clean.length - limit) };
}
