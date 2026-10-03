import { EMPTY_FILTERS, filterCatalog, isCatalogProgram, parseCatalogFilters, validDate, type CatalogProgram } from "./catalog";
import { dedupeProgramListingsByEvent } from "./dedupeProgramListingsByEvent";
import { programStartDay, type DateRange } from "./dateSearch";

export const MINI_LEVELS = [
  { value: "beginner", label: "Начальный" },
  { value: "intermediate", label: "Средний" },
  { value: "advanced", label: "Продвинутый" },
  { value: "expert", label: "Экспертный" },
  { value: "all_levels", label: "Обозначено «любой»" },
] as const;

export function readMiniCatalog(data: unknown): CatalogProgram[] {
  if (!Array.isArray(data) || !data.every(isCatalogProgram)) throw new Error("Invalid catalog response");
  return dedupeProgramListingsByEvent(data);
}

export function miniEntry(search: string, hash = "", telegramPreset?: string) {
  const query = new URLSearchParams(search);
  const fragment = new URLSearchParams(hash.replace(/^#/, ""));
  const filters = parseCatalogFilters(search);
  return {
    preset: telegramPreset || query.get("tgWebAppStartParam") || fragment.get("tgWebAppStartParam") || query.get("preset"),
    discipline: filters.disciplines[0] ?? "",
    level: MINI_LEVELS.some((l) => l.value === filters.levels[0]) ? filters.levels[0]! : "",
    range: filters.from && (!filters.to || filters.from <= filters.to)
      ? { from: filters.from, to: filters.to || filters.from } : null,
  };
}

/** Filter before counting: the calendar, visible list and CTA must agree. */
export function miniPrograms(programs: CatalogProgram[], range: DateRange | null, discipline: string, level: string, today: string) {
  if (!validDate(today)) return [];
  return filterCatalog(programs, {
    ...EMPTY_FILTERS,
    disciplines: discipline ? [discipline] : [],
    levels: level ? [level] : [],
    from: range?.from || today,
    to: range?.to || "",
  }, new Date(`${today}T12:00:00`)).filter((p) => programStartDay(p) !== null);
}

export function miniCatalogQuery(range: DateRange | null, discipline: string, level: string, existing = "") {
  const query = new URLSearchParams();
  if (range) {
    query.set("from", range.from);
    query.set("to", range.to);
  }
  if (discipline) query.set("discipline", discipline);
  if (level) query.set("level", level);
  for (const [key, value] of new URLSearchParams(existing)) if (key.startsWith("utm_")) query.set(key, value);
  return query.toString();
}
