import { localDate, validDate } from "./catalog";
import { getDisciplineDisplay } from "./disciplineLabels";
import { isOnRequestProgram } from "./programSchedule";

export type TourDateWindow = "" | "30" | "60" | "90";

type FilterableTour = {
  discipline: string;
  region: string;
  exactLocation?: string | null;
  startDate: string;
  endDate: string;
  scheduleType?: string | null;
};

const normalize = (value: string) => value.trim().toLocaleLowerCase("ru").replace(/ё/g, "е").replace(/\s+/g, " ");

/** Use the catalog's discipline, never infer it from the title or itinerary. */
export function tourDiscipline(value: string): { id: string; label: string } | null {
  const display = getDisciplineDisplay(value);
  const label = display.translation ?? display.original;
  const key = normalize(label);
  // Wildlife was explicitly excluded by the owner. Unclassified programs stay in “Все”.
  if (!key || /^(unknown|уточняется|неизвестно|дикая природа|wildlife)$/.test(key)) return null;
  return { id: `discipline:${key}`, label: label.charAt(0).toLocaleUpperCase("ru") + label.slice(1) };
}

export function availableTours<T extends FilterableTour>(
  programs: T[],
  filters: { dateWindow: TourDateWindow; region: string },
  now = new Date(),
): T[] {
  const today = localDate(now);
  const lastDay = new Date(now);
  lastDay.setDate(lastDay.getDate() + Number(filters.dateWindow));
  const limit = filters.dateWindow ? localDate(lastDay) : "";
  const region = normalize(filters.region);
  return programs.filter((program) => {
    const start = validDate(program.startDate.slice(0, 10));
    const end = validDate(program.endDate.slice(0, 10));
    if (!start || !end || end < start || end < today) return false;
    if (region && ![program.region, program.exactLocation ?? ""].some((value) => normalize(value).includes(region))) return false;
    // On-request dates describe the season: include an overlapping season, not only its first day.
    if (limit && (start > limit || (!isOnRequestProgram(program) && start < today))) return false;
    return true;
  }).sort((a, b) => Number(isOnRequestProgram(a)) - Number(isOnRequestProgram(b)) || a.startDate.localeCompare(b.startDate));
}

export function tourFilterChips(programs: FilterableTour[]): { id: string; label: string; count: number }[] {
  const disciplines = new Map<string, { id: string; label: string; count: number }>();
  for (const program of programs) {
    const discipline = tourDiscipline(program.discipline);
    if (!discipline) continue;
    const previous = disciplines.get(discipline.id);
    disciplines.set(discipline.id, { ...discipline, count: (previous?.count ?? 0) + 1 });
  }
  return [
    { id: "all", label: "Все", count: programs.length },
    ...[...disciplines.values()].sort((a, b) => a.label.localeCompare(b.label, "ru")),
  ];
}
