import { createHash } from "node:crypto";

export const SPOT_METHODOLOGY_STATUSES = ["draft", "approved", "retired"] as const;
export type SpotMethodologyStatus = (typeof SPOT_METHODOLOGY_STATUSES)[number];

export interface SpotMethodologyCriterion {
  code: string;
  titleRu: string;
  weight: number;
  scoreBearing: boolean;
  evidenceRequired: string[];
  guidance: string[];
}

export interface SpotMethodologyGate {
  code: string;
  key: string;
  titleRu: string;
  remoteRemediable: boolean;
}

export interface SpotMethodologyBand {
  code: string;
  labelRu: string;
  minScore: number;
}

export interface SpotMethodologyDefinition {
  discipline: string;
  methodologyVersion: string;
  protocolVersion: string;
  criteriaVersion: string;
  ratingVersion: string;
  validityMonths: number;
  rounding: string;
  scale: { min: number; max: number; step: number };
  criteria: SpotMethodologyCriterion[];
  gates: SpotMethodologyGate[];
  gatePolicy: { unknownIsZero: boolean; failOrUnknownBlocks: boolean };
  bands: SpotMethodologyBand[];
  equipmentSchema: { required: string[]; optional: string[] };
  relatedSpotRules: { externalExpertRequired: boolean; independentEditorRequired: boolean };
  publicStatusPolicy: Record<string, string>;
}

/** "wakesurf" + "v1.1" → "spotmeth_wakesurf_v1_1". */
export function buildSpotMethodologyId(discipline: string, methodologyVersion: string): string {
  const slug = (value: string) => value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  return `spotmeth_${slug(discipline)}_${slug(methodologyVersion)}`;
}

function canonicalize(value: unknown, path: string): unknown {
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error(`non-finite number at ${path}`);
    return value;
  }
  if (Array.isArray(value)) return value.map((item, index) => canonicalize(item, `${path}[${index}]`));
  if (typeof value === "object") {
    const source = value as Record<string, unknown>;
    const result: Record<string, unknown> = {};
    for (const key of Object.keys(source).sort()) {
      if (source[key] === undefined) throw new Error(`undefined value at ${path}.${key}`);
      result[key] = canonicalize(source[key], `${path}.${key}`);
    }
    return result;
  }
  throw new Error(`unsupported JSON value at ${path}: ${typeof value}`);
}

/** JSON с сортировкой ключей объектов (порядок элементов массивов значим) — основа definitionSha256. */
export function canonicalJsonStringify(value: unknown): string {
  return JSON.stringify(canonicalize(value, "$"));
}

export function computeDefinitionSha256(definition: unknown): string {
  return createHash("sha256").update(canonicalJsonStringify(definition), "utf8").digest("hex");
}

function requireNonEmptyString(source: Record<string, unknown>, key: string): string {
  const value = source[key];
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`methodology definition: "${key}" must be a non-empty string`);
  }
  return value;
}

/** Минимальная структурная проверка перед записью в реестр; содержательные инварианты покрыты тестами. */
export function parseSpotMethodologyDefinition(raw: unknown): SpotMethodologyDefinition {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error("methodology definition must be a JSON object");
  }
  const source = raw as Record<string, unknown>;
  for (const key of ["discipline", "methodologyVersion", "protocolVersion", "criteriaVersion", "ratingVersion", "rounding"]) {
    requireNonEmptyString(source, key);
  }
  if (!Number.isInteger(source.validityMonths) || (source.validityMonths as number) <= 0) {
    throw new Error('methodology definition: "validityMonths" must be a positive integer');
  }
  for (const key of ["criteria", "gates", "bands"]) {
    if (!Array.isArray(source[key]) || (source[key] as unknown[]).length === 0) {
      throw new Error(`methodology definition: "${key}" must be a non-empty array`);
    }
  }
  return raw as SpotMethodologyDefinition;
}

export interface ExistingSpotMethodology {
  status: string;
  definitionSha256: string;
  /** Сколько оценок (`spot_audits`) закреплено за этой строкой. */
  pinnedAudits: number;
}

export type SpotMethodologyPlan =
  | { action: "create" }
  | { action: "update"; previousSha256: string }
  | { action: "noop"; status: string }
  | { action: "blocked_pinned_audits"; status: string; existingSha256: string; pinnedAudits: number; message: string }
  | { action: "error"; status: string; existingSha256: string; message: string };

/**
 * Скрипт загрузки никогда не утверждает методику: создаёт/обновляет только draft.
 * Изменение утверждённой или выведенной методики = новая версия, а не правка строки.
 * Черновик, за которым уже закреплены оценки, тоже не правится (иначе пилотные оценки
 * перестают соответствовать методике) — это тоже новая версия.
 */
export function planSpotMethodologyAction(
  existing: ExistingSpotMethodology | null,
  computedSha256: string,
): SpotMethodologyPlan {
  if (!existing) return { action: "create" };
  if (existing.definitionSha256 === computedSha256) return { action: "noop", status: existing.status };
  if (existing.status === "draft" && existing.pinnedAudits > 0) {
    return {
      action: "blocked_pinned_audits",
      status: existing.status,
      existingSha256: existing.definitionSha256,
      pinnedAudits: existing.pinnedAudits,
      message:
        `draft definition differs from the file (db ${existing.definitionSha256.slice(0, 12)}…, ` +
        `file ${computedSha256.slice(0, 12)}…) but ${existing.pinnedAudits} assessment(s) are pinned to it; ` +
        "bump the version and add a new file instead",
    };
  }
  if (existing.status === "draft") return { action: "update", previousSha256: existing.definitionSha256 };
  return {
    action: "error",
    status: existing.status,
    existingSha256: existing.definitionSha256,
    message:
      `methodology is ${existing.status} and its definition differs from the file ` +
      `(db ${existing.definitionSha256.slice(0, 12)}…, file ${computedSha256.slice(0, 12)}…); ` +
      "approved/retired definitions are immutable — bump the version and add a new file instead",
  };
}
