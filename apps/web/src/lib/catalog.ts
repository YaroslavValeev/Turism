import type { ProgramCardProgram } from "./programCardModel";
import { getDisciplineDisplay } from "./disciplineLabels";

export type CatalogProgram = ProgramCardProgram & {
  formatType?: string | null;
};
export function isCatalogProgram(value: unknown): value is CatalogProgram {
  if (!value || typeof value !== "object") return false;
  const p = value as Record<string, unknown>;
  if (
    !["id", "title", "discipline", "region", "startDate", "endDate"].every(
      (key) => typeof p[key] === "string",
    )
  )
    return false;
  if (typeof p.durationDays !== "number" || !Number.isFinite(p.durationDays))
    return false;
  if (
    p.priceFromRub != null &&
    (typeof p.priceFromRub !== "number" || !Number.isFinite(p.priceFromRub))
  )
    return false;
  if (
    !["exactLocation", "levelRequired", "formatType", "audienceFit"].every(
      (key) => p[key] == null || typeof p[key] === "string",
    )
  )
    return false;
  if (
    p.media != null &&
    (!Array.isArray(p.media) ||
      !p.media.every(
        (m) =>
          m && typeof m.url === "string" && typeof m.mediaType === "string",
      ))
  )
    return false;
  return (
    p.organizer == null ||
    (typeof p.organizer === "object" &&
      typeof (p.organizer as Record<string, unknown>).displayName === "string")
  );
}
export type CatalogFilters = {
  disciplines: string[];
  region: string;
  levels: string[];
  from: string;
  to: string;
  season: string;
  format: string;
  nearest: boolean;
};

export const EMPTY_FILTERS: CatalogFilters = {
  disciplines: [],
  region: "",
  levels: [],
  from: "",
  to: "",
  season: "",
  format: "",
  nearest: false,
};
export const SEASONS: Record<string, string> = {
  winter: "Зима",
  spring: "Весна",
  summer: "Лето",
  autumn: "Осень",
};
export const FORMATS: Record<string, string> = {
  camp: "Кэмп",
  clinic: "Тренировочный интенсив",
  festival: "Фестиваль",
  weekend: "Выходные",
};
const legacyFormats: Record<string, string> = {
  кэмп: "camp",
  clinic: "clinic",
  интенсив: "clinic",
  выходные: "weekend",
};
const norm = (value: string | null | undefined) =>
  (value ?? "").trim().toLocaleLowerCase("ru").replace(/ё/g, "е");

export function validDate(value: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return "";
  const date = new Date(`${value}T12:00:00Z`);
  return Number.isFinite(date.getTime()) &&
    date.toISOString().slice(0, 10) === value
    ? value
    : "";
}

export function localDate(now = new Date()): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

export function parseCatalogFilters(query: string): CatalogFilters {
  const p = new URLSearchParams(query);
  const disciplines = [
    ...new Set(
      p
        .getAll("discipline")
        .map((v) => v.trim())
        .filter(Boolean),
    ),
  ];
  const legacy =
    disciplines.length === 1 ? legacyFormats[norm(disciplines[0])] : undefined;
  return {
    disciplines: legacy ? [] : disciplines,
    region: (p.get("region") || p.get("country") || "").trim(),
    levels: [...new Set(p.getAll("level").filter(Boolean))],
    from: validDate(p.get("from") || ""),
    to: validDate(p.get("to") || ""),
    season: p.get("season") || "",
    format: p.get("format") || legacy || "",
    nearest: p.get("nearest") === "1",
  };
}

export function catalogQuery(filters: CatalogFilters, existing = ""): string {
  const p = new URLSearchParams(existing);
  for (const key of [
    "discipline",
    "region",
    "country",
    "level",
    "from",
    "to",
    "season",
    "format",
    "nearest",
  ])
    p.delete(key);
  filters.disciplines.forEach((value) => p.append("discipline", value));
  filters.levels.forEach((value) => p.append("level", value));
  for (const [key, value] of Object.entries({
    region: filters.region,
    from: filters.from,
    to: filters.to,
    season: filters.season,
    format: filters.format,
  })) {
    if (value) p.set(key, value);
  }
  if (filters.nearest) p.set("nearest", "1");
  return p.toString();
}

export function dateRangeError(filters: CatalogFilters): string | null {
  return filters.from && filters.to && filters.from > filters.to
    ? "Дата окончания поиска должна быть не раньше даты начала."
    : null;
}

export function isFestival(
  program: Pick<CatalogProgram, "title" | "formatType">,
): boolean {
  return /festival|competition|фестивал|соревнован/i.test(
    `${program.formatType ?? ""} ${program.title}`,
  );
}

export function participantLevel(
  program: Pick<CatalogProgram, "title" | "formatType" | "levelRequired">,
  label: string,
): string {
  if (
    isFestival(program) &&
    (!program.levelRequired || program.levelRequired === "all_levels")
  )
    return "Зависит от категории участия";
  return program.levelRequired ? label : "Требования уточняются";
}

export function programFormatLabel(value: string | null | undefined): string {
  const v = norm(value);
  const other: Record<string, string> = {
    training: "Тренировка",
    tour: "Спортивный выезд",
    competition: "Соревнование",
  };
  return FORMATS[v] || other[v] || "Формат уточняется";
}

export function filterCatalog<T extends CatalogProgram>(
  programs: T[],
  filters: CatalogFilters,
  now = new Date(),
): T[] {
  if (dateRangeError(filters)) return [];
  const today = localDate(now);
  const limit = new Date(now);
  limit.setDate(limit.getDate() + 14);
  return programs
    .filter((p) => {
      const start = validDate(p.startDate.slice(0, 10));
      const end = validDate(p.endDate.slice(0, 10));
      if (!start || !end || end < start || end < today) return false;
      const d = getDisciplineDisplay(p.discipline);
      if (
        filters.disciplines.length &&
        !filters.disciplines.some((v) =>
          [d.original, d.translation].some((x) => norm(x) === norm(v)),
        )
      )
        return false;
      const region = norm(`${p.region} ${p.exactLocation ?? ""}`);
      const query = norm(filters.region).replace(/\s*·\s*/g, " ");
      if (query && !region.includes(query)) return false;
      if (
        filters.levels.length &&
        !filters.levels.includes(p.levelRequired ?? "")
      )
        return false;
      if (
        filters.levels.includes("beginner") &&
        isFestival(p) &&
        p.levelRequired !== "beginner"
      )
        return false;
      if (filters.from && start < filters.from) return false;
      if (filters.to && start > filters.to) return false;
      if (filters.nearest && (start < today || start > localDate(limit)))
        return false;
      const month = Number(start.slice(5, 7));
      const season =
        month === 12 || month < 3
          ? "winter"
          : month < 6
            ? "spring"
            : month < 9
              ? "summer"
              : "autumn";
      if (filters.season && season !== filters.season) return false;
      if (filters.format === "weekend") {
        if (p.durationDays < 2 || p.durationDays > 4) return false;
      } else if (filters.format && norm(p.formatType) !== norm(filters.format))
        return false;
      return true;
    })
    .sort((a, b) => a.startDate.localeCompare(b.startDate));
}

/** Only a same-origin catalogue path may be used as a return destination. */
export function safeCatalogReturn(value: string | null): string {
  if (!value || !/^\/(?:\?|#|$)/.test(value) || /[\\\r\n]/.test(value))
    return "/#programs";
  return value;
}
