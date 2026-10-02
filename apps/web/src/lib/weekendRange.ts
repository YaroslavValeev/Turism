export type WeekendPreset = "this-weekend" | "next-weekend";

export type WeekendRange = {
  preset: WeekendPreset;
  /** Первый день поиска (YYYY-MM-DD): пятница или сегодня, если пятница уже прошла. */
  from: string;
  /** Воскресенье (YYYY-MM-DD). */
  to: string;
  /** «2–4 окт», «30 окт – 1 нояб». */
  label: string;
};

export const WEEKEND_PRESET_TITLES: Record<WeekendPreset, string> = {
  "this-weekend": "Эти выходные",
  "next-weekend": "Следующие выходные",
};

const MONTHS_SHORT = ["янв", "фев", "мар", "апр", "мая", "июн", "июл", "авг", "сен", "окт", "нояб", "дек"];

export function isWeekendPreset(value: string | null | undefined): value is WeekendPreset {
  return value === "this-weekend" || value === "next-weekend";
}

function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function addDays(d: Date, days: number): Date {
  const next = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  next.setDate(next.getDate() + days);
  return next;
}

function rangeLabel(from: Date, to: Date): string {
  if (from.getMonth() === to.getMonth()) {
    return from.getDate() === to.getDate()
      ? `${to.getDate()} ${MONTHS_SHORT[to.getMonth()]}`
      : `${from.getDate()}–${to.getDate()} ${MONTHS_SHORT[to.getMonth()]}`;
  }
  return `${from.getDate()} ${MONTHS_SHORT[from.getMonth()]} – ${to.getDate()} ${MONTHS_SHORT[to.getMonth()]}`;
}

/**
 * Выходные = пт–сб–вс по локальному времени.
 * «Эти выходные»: если сегодня пт/сб/вс — текущие (с сегодняшнего дня), иначе ближайшие впереди.
 * «Следующие выходные»: на неделю позже «этих», т.е. в воскресенье — ближайшие будущие пт–вс.
 */
export function weekendRange(preset: WeekendPreset, now = new Date()): WeekendRange {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const day = today.getDay(); // 0 = вс … 5 = пт, 6 = сб
  const inWeekend = day === 5 || day === 6 || day === 0;
  const thisFriday = inWeekend ? addDays(today, -((day + 2) % 7)) : addDays(today, 5 - day);
  const friday = preset === "this-weekend" ? thisFriday : addDays(thisFriday, 7);
  const sunday = addDays(friday, 2);
  const from = friday < today ? today : friday;
  return { preset, from: ymd(from), to: ymd(sunday), label: rangeLabel(from, sunday) };
}
