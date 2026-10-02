import { DISCIPLINES, type DisciplineId } from "./disciplines";
import { ACTIVITY_FORMATS, type ActivityFormatId } from "./formats";
import { SCOUT_AREAS, type ScoutAreaId } from "./scoutAreas";

/** lowercase, ё→е, юникодные тире → «-», trim, схлопывание пробелов. */
export function normalizeToken(raw: string | null | undefined): string {
  return String(raw ?? "")
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/[\u2010-\u2015]/g, "-")
    .replace(/\s+/g, " ")
    .trim();
}

type IndexedDef<T extends string> = { id: T; labelRu: string; labelEn?: string; aliases: readonly string[] };

function buildIndex<T extends string>(defs: readonly IndexedDef<T>[]): Map<string, T> {
  const index = new Map<string, T>();
  for (const def of defs) {
    for (const key of [def.id, def.labelRu, def.labelEn ?? "", ...def.aliases]) {
      const n = normalizeToken(key);
      if (n && !index.has(n)) index.set(n, def.id);
    }
  }
  return index;
}

const disciplineIndex = buildIndex<DisciplineId>(DISCIPLINES);
const formatIndex = buildIndex<ActivityFormatId>(ACTIVITY_FORMATS);
const scoutAreaIndex = buildIndex<ScoutAreaId>(SCOUT_AREAS);

const scoutSubjectIndex = (() => {
  const bySubject = new Map<string, Set<ScoutAreaId>>();
  for (const area of SCOUT_AREAS) {
    for (const subject of area.subjectsRu) {
      const n = normalizeToken(subject);
      const set = bySubject.get(n) ?? new Set<ScoutAreaId>();
      set.add(area.id);
      bySubject.set(n, set);
    }
  }
  const unique = new Map<string, ScoutAreaId>();
  for (const [subject, ids] of bySubject) {
    if (ids.size === 1) unique.set(subject, [...ids][0]);
  }
  return unique;
})();

const LIST_SPLIT_RE = /[/+,;]/;

function splitList(raw: string): string[] {
  return raw
    .split(LIST_SPLIT_RE)
    .map(normalizeToken)
    .filter(Boolean);
}

/** Точное совпадение id/названия/алиаса; для составных значений («Kite / camp») — первая дисциплина из списка. */
export function resolveDiscipline(raw: string | null | undefined): DisciplineId | null {
  const n = normalizeToken(raw);
  if (!n) return null;
  return disciplineIndex.get(n) ?? resolveDisciplines(n).disciplines[0] ?? null;
}

export function resolveFormat(raw: string | null | undefined): ActivityFormatId | null {
  const n = normalizeToken(raw);
  if (!n) return null;
  return formatIndex.get(n) ?? null;
}

/**
 * «Kite / camp» → { disciplines: ["kite"], formats: ["camp"] }.
 * Разделители: / + , ;. Если часть — и дисциплина, и формат («экспедиции»), она считается дисциплиной.
 * Нераспознанные части пропускаются.
 */
export function resolveDisciplines(raw: string | null | undefined): {
  disciplines: DisciplineId[];
  formats: ActivityFormatId[];
} {
  const disciplines: DisciplineId[] = [];
  const formats: ActivityFormatId[] = [];
  const n = normalizeToken(raw);
  if (!n) return { disciplines, formats };
  const whole = disciplineIndex.get(n);
  const parts = whole ? [n] : splitList(n);
  for (const part of parts) {
    const d = disciplineIndex.get(part);
    if (d) {
      if (!disciplines.includes(d)) disciplines.push(d);
      continue;
    }
    const f = formatIndex.get(part);
    if (f && !formats.includes(f)) formats.push(f);
  }
  return { disciplines, formats };
}

/** Русское название дисциплины; если не распознана — исходная строка без крайних пробелов. */
export function disciplineLabelRu(idOrRaw: string | null | undefined): string {
  const id = resolveDiscipline(idOrRaw);
  if (id) return DISCIPLINES.find((d) => d.id === id)!.labelRu;
  return String(idOrRaw ?? "").trim();
}

/** По id, названию, алиасу или однозначному субъекту РФ. */
export function resolveScoutArea(raw: string | null | undefined): ScoutAreaId | null {
  const n = normalizeToken(raw);
  if (!n) return null;
  return scoutAreaIndex.get(n) ?? scoutSubjectIndex.get(n) ?? null;
}
