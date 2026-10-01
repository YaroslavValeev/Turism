/**
 * Туры «по запросу»: у них нет даты заезда, только сезон. В startDate/endDate такой программы
 * хранится окно сезона — поэтому витрина, горизонт публикации и сортировка работают как у
 * выездов с датами. Прошедшее окно не архивируется, а переносится на следующий год.
 */
export const SCHEDULE_TYPES = ["fixed", "on_request"] as const;
export type ScheduleType = (typeof SCHEDULE_TYPES)[number];

export function isOnRequestSchedule(scheduleType: string | null | undefined): boolean {
  return scheduleType === "on_request";
}

const DAY_MS = 86_400_000;

function utcDay(value: Date): number {
  return Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate());
}

function addUtcYears(value: Date, years: number): Date {
  const next = new Date(value);
  next.setUTCFullYear(next.getUTCFullYear() + years);
  return next;
}

/** Окно, сдвинутое на целое число лет так, чтобы его конец был не раньше сегодняшнего дня; null — сдвиг не нужен. */
export function rollWindowForward(
  startDate: Date,
  endDate: Date,
  now = new Date(),
): { startDate: Date; endDate: Date } | null {
  const today = utcDay(now);
  if (utcDay(endDate) >= today) return null;
  let start = new Date(startDate);
  let end = new Date(endDate);
  for (let i = 0; i < 50 && utcDay(end) < today; i += 1) {
    start = addUtcYears(start, 1);
    end = addUtcYears(end, 1);
  }
  return { startDate: start, endDate: end };
}

/**
 * Ближайшее окно сезона по месяцам 1–12 (сезон может переходить через Новый год, например 12→4).
 * Текущий сезон, если он ещё не закончился, иначе — следующий.
 */
export function seasonWindow(fromMonth: number, toMonth: number, now = new Date()): { startDate: Date; endDate: Date } {
  const year = now.getUTCFullYear();
  const build = (startYear: number) => {
    const endYear = toMonth >= fromMonth ? startYear : startYear + 1;
    return {
      startDate: new Date(Date.UTC(startYear, fromMonth - 1, 1, 12)),
      endDate: new Date(Date.UTC(endYear, toMonth, 0, 12)),
    };
  };
  for (const startYear of [year - 1, year, year + 1]) {
    const window = build(startYear);
    if (utcDay(window.endDate) >= utcDay(now)) return window;
  }
  return build(year + 1);
}

/** Круглый год: окно на 12 месяцев от сегодняшнего дня, дальше его продлевает rollWindowForward. */
export function yearRoundWindow(now = new Date()): { startDate: Date; endDate: Date } {
  const start = new Date(utcDay(now) + 12 * 3_600_000);
  return { startDate: start, endDate: new Date(start.getTime() + 364 * DAY_MS) };
}

const MONTHS_NOMINATIVE = [
  "январь",
  "февраль",
  "март",
  "апрель",
  "май",
  "июнь",
  "июль",
  "август",
  "сентябрь",
  "октябрь",
  "ноябрь",
  "декабрь",
];

export function formatSeasonMonthsRu(fromMonth: number, toMonth: number): string {
  if (fromMonth === toMonth) return MONTHS_NOMINATIVE[fromMonth - 1] ?? "";
  return `${MONTHS_NOMINATIVE[fromMonth - 1]}–${MONTHS_NOMINATIVE[toMonth - 1]}`;
}

/** «По запросу · сезон июнь–сентябрь» / «По запросу · круглый год». */
export function formatOnRequestLabel(seasonLabel: string | null | undefined): string {
  const season = seasonLabel?.trim();
  if (!season) return "По запросу";
  if (/круглый год/i.test(season)) return "По запросу · круглый год";
  return `По запросу · сезон ${season}`;
}
