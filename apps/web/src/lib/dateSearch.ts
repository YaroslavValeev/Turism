import { localDate } from "./catalog";

export type DateRange = { from: string; to: string };

export type DatedProgram = { startDate: string; scheduleType?: string | null };

export type CalendarDay = { date: string; day: number; inMonth: boolean };

export const MONTHS_NOMINATIVE = [
  "Январь", "Февраль", "Март", "Апрель", "Май", "Июнь",
  "Июль", "Август", "Сентябрь", "Октябрь", "Ноябрь", "Декабрь",
];
export const WEEKDAYS_SHORT = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];
const MONTHS_GENITIVE = ["янв", "фев", "мар", "апр", "мая", "июн", "июл", "авг", "сен", "окт", "нояб", "дек"];

export function addDaysYmd(ymd: string, days: number): string {
  const [y, m, d] = ymd.split("-").map(Number) as [number, number, number];
  return localDate(new Date(y, m - 1, d + days));
}

/** Недели месяца с понедельника; хвосты соседних месяцев помечены `inMonth: false`. */
export function monthGrid(year: number, month: number): CalendarDay[][] {
  const first = new Date(year, month, 1);
  const lead = (first.getDay() + 6) % 7;
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells = Math.ceil((lead + daysInMonth) / 7) * 7;
  const weeks: CalendarDay[][] = [];
  for (let i = 0; i < cells; i += 1) {
    const d = new Date(year, month, 1 - lead + i);
    if (i % 7 === 0) weeks.push([]);
    weeks[weeks.length - 1]!.push({ date: localDate(d), day: d.getDate(), inMonth: d.getMonth() === month });
  }
  return weeks;
}

/** Первый тап — начало, второй — конец (порядок не важен), третий начинает выбор заново. */
export function pickDay(range: DateRange, day: string): DateRange {
  if (!range.from || range.to) return { from: day, to: "" };
  return day < range.from ? { from: day, to: range.from } : { from: range.from, to: day };
}

export function effectiveRange(range: DateRange): DateRange | null {
  if (!range.from) return null;
  return { from: range.from, to: range.to || range.from };
}

/** Дата старта по местному календарю; туры «по запросу» без реальной даты не участвуют. */
export function programStartDay(p: DatedProgram): string | null {
  if (p.scheduleType === "on_request") return null;
  const t = new Date(p.startDate);
  return Number.isFinite(t.getTime()) ? localDate(t) : null;
}

export function startsByDay(programs: DatedProgram[], today: string): Map<string, number> {
  const map = new Map<string, number>();
  for (const p of programs) {
    const day = programStartDay(p);
    if (day && day >= today) map.set(day, (map.get(day) ?? 0) + 1);
  }
  return map;
}

export function countInRange(byDay: Map<string, number>, range: DateRange | null): number {
  if (!range) return 0;
  let n = 0;
  for (const [day, count] of byDay) if (day >= range.from && day <= range.to) n += count;
  return n;
}

export function nextStartAfter(byDay: Map<string, number>, day: string): string | null {
  let best: string | null = null;
  for (const d of byDay.keys()) if (d > day && (!best || d < best)) best = d;
  return best;
}

export function formatDay(ymd: string): string {
  const [, m, d] = ymd.split("-").map(Number) as [number, number, number];
  return `${d} ${MONTHS_GENITIVE[m - 1]}`;
}

export function formatRange(range: DateRange | null): string {
  if (!range) return "";
  return range.from === range.to ? formatDay(range.from) : `${formatDay(range.from)} – ${formatDay(range.to)}`;
}
