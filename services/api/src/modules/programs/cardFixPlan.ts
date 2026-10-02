import { nextManualFields } from "./manualFields";

/** Поля карточки, которые разрешено править разовым data-fix скриптом. publishStatus сюда намеренно не входит. */
export const CARD_FIX_FIELDS = [
  "title", "region", "exactLocation", "startDate", "endDate", "durationDays", "sourceUrl", "priceFromRub", "currency",
] as const;

export type CardFixField = (typeof CARD_FIX_FIELDS)[number];
export type CardFixValue = string | number | Date | null;
export type CardFixValues = Partial<Record<CardFixField, CardFixValue>>;

export interface CardFixSpec {
  programId: string;
  /** Для человека в отчёте: короткое название карточки. */
  label: string;
  /** Ожидаемые текущие значения в БД; если хоть одно не совпало (и не равно уже целевому) — строка пропускается. */
  expect: CardFixValues;
  set: CardFixValues;
  evidence: string[];
  note: string;
}

export type ProgramFixSnapshot = { id: string; manualFields: string[] } & Partial<Record<CardFixField, CardFixValue | undefined>>;

export interface CardFieldChange {
  field: CardFixField;
  from: CardFixValue;
  to: CardFixValue;
}

export type CardFixOutcome =
  | { status: "missing"; programId: string }
  | { status: "guard_mismatch"; programId: string; mismatches: { field: CardFixField; expected: CardFixValue; actual: CardFixValue }[] }
  | { status: "noop"; programId: string }
  | {
      status: "update";
      programId: string;
      changes: CardFieldChange[];
      data: CardFixValues & { manualFields?: string[] };
      manualFieldsBefore: string[];
      manualFieldsAfter: string[];
    };

/** Нормализует значение для сравнения: даты — ISO, строки — без краевых пробелов, пусто — null. */
export function comparableFixValue(value: CardFixValue | undefined): string | null {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return value.toISOString();
  const s = String(value).trim();
  return s === "" ? null : s;
}

function sameValue(a: CardFixValue | undefined, b: CardFixValue | undefined): boolean {
  return comparableFixValue(a) === comparableFixValue(b);
}

/**
 * Чистое планирование одной правки: guard по expect → дифф по set → объединение manualFields.
 * Повторный запуск после применения даёт noop (идемпотентность).
 */
export function planCardFix(spec: CardFixSpec, program: ProgramFixSnapshot | null | undefined): CardFixOutcome {
  if (!program) return { status: "missing", programId: spec.programId };

  const setFields = Object.keys(spec.set) as CardFixField[];
  const changes: CardFieldChange[] = setFields
    .filter((field) => !sameValue(program[field], spec.set[field]))
    .map((field) => ({ field, from: program[field] ?? null, to: spec.set[field] ?? null }));

  const manualFieldsBefore = [...(program.manualFields ?? [])].sort();
  const manualFieldsAfter = nextManualFields(manualFieldsBefore, setFields);
  const manualFieldsChanged = manualFieldsAfter.join("\u0000") !== manualFieldsBefore.join("\u0000");

  if (changes.length === 0 && !manualFieldsChanged) return { status: "noop", programId: spec.programId };

  // Поле, уже приведённое к целевому значению (например, вручную в админке), guard не нарушает.
  const mismatches = (Object.keys(spec.expect) as CardFixField[])
    .filter((field) => !sameValue(program[field], spec.expect[field]))
    .filter((field) => !(field in spec.set && sameValue(program[field], spec.set[field])))
    .map((field) => ({ field, expected: spec.expect[field] ?? null, actual: program[field] ?? null }));
  if (mismatches.length > 0) return { status: "guard_mismatch", programId: spec.programId, mismatches };

  const data: CardFixValues & { manualFields?: string[] } = {};
  for (const change of changes) data[change.field] = change.to;
  if (manualFieldsChanged) data.manualFields = manualFieldsAfter;

  return { status: "update", programId: spec.programId, changes, data, manualFieldsBefore, manualFieldsAfter };
}

export function cardFixAuditReason(tag: string, spec: CardFixSpec): string {
  return `${tag}: ${spec.note}`;
}
