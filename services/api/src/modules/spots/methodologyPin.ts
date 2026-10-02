import { computeDefinitionSha256 } from "./methodologyRegistry";
import { SPOT_MANDATORY_GATES, SPOT_RATING_WEIGHTS } from "./ratingEngine";

/** Строка `spot_methodologies`, нужная для закрепления оценки и расчёта снимка. */
export interface PinnableMethodology {
  id: string;
  discipline: string;
  methodologyVersion: string;
  protocolVersion: string;
  criteriaVersion: string;
  ratingVersion: string;
  status: string;
  definition: unknown;
  definitionSha256: string;
}

export interface MethodologyAssessmentPin {
  methodologyId: string;
  methodologySha256: string;
  methodologyVersion: string;
  protocolVersion: string;
  criteriaVersion: string;
}

export type MethodologyPinPlan =
  | { ok: true; pin: MethodologyAssessmentPin }
  | { ok: false; status: 400 | 404 | 409; error: string };

/**
 * Новая оценка получает версии и хеш определения из реестра, а не из тела запроса.
 * Черновая методика допустима (пилотные тесты), выведенная — нет.
 */
export function planAssessmentMethodologyPin(
  methodology: PinnableMethodology | null,
  unitDiscipline: string,
  requested: { methodologyVersion?: string; protocolVersion?: string; criteriaVersion?: string },
): MethodologyPinPlan {
  if (!methodology) return { ok: false, status: 404, error: "methodology not found in the registry" };
  if (methodology.status === "retired") {
    return { ok: false, status: 409, error: `methodology ${methodology.id} is retired; use a current version` };
  }
  if (methodology.discipline !== unitDiscipline) {
    return {
      ok: false,
      status: 400,
      error: `methodology ${methodology.id} is for ${methodology.discipline}, unit discipline is ${unitDiscipline}`,
    };
  }
  for (const field of ["methodologyVersion", "protocolVersion", "criteriaVersion"] as const) {
    if (requested[field] !== undefined && requested[field] !== methodology[field]) {
      return { ok: false, status: 400, error: `${field} does not match methodology ${methodology.id}` };
    }
  }
  return {
    ok: true,
    pin: {
      methodologyId: methodology.id,
      methodologySha256: methodology.definitionSha256,
      methodologyVersion: methodology.methodologyVersion,
      protocolVersion: methodology.protocolVersion,
      criteriaVersion: methodology.criteriaVersion,
    },
  };
}

export type PinnedMethodologyCheck =
  | { ok: true; approved: boolean; ratingVersion: string }
  | {
      ok: false;
      error:
        | "assessment_not_pinned"
        | "methodology_changed_since_assessment"
        | "methodology_integrity_failed"
        | "methodology_engine_mismatch";
      message: string;
    };

function sameEntries(actual: Record<string, unknown>, expected: Record<string, unknown>): boolean {
  const keys = Object.keys(expected);
  return Object.keys(actual).length === keys.length && keys.every((key) => actual[key] === expected[key]);
}

/** Определение должно описывать ровно то, что считает движок: те же веса, гейты и срок действия. */
function definitionMatchesEngine(definition: unknown): boolean {
  if (definition === null || typeof definition !== "object") return false;
  const source = definition as { criteria?: unknown; gates?: unknown; validityMonths?: unknown };
  if (!Array.isArray(source.criteria) || !Array.isArray(source.gates)) return false;
  const weights = Object.fromEntries(
    source.criteria.map((c: { code?: unknown; weight?: unknown }) => [String(c?.code), c?.weight]),
  );
  const gates = Object.fromEntries(source.gates.map((g: { code?: unknown; key?: unknown }) => [String(g?.code), g?.key]));
  return (
    source.criteria.length === Object.keys(SPOT_RATING_WEIGHTS).length &&
    source.gates.length === Object.keys(SPOT_MANDATORY_GATES).length &&
    sameEntries(weights, SPOT_RATING_WEIGHTS) &&
    sameEntries(gates, SPOT_MANDATORY_GATES) &&
    source.validityMonths === 12
  );
}

/**
 * Снимок считается только по той версии методики, за которой закреплена оценка.
 * «Методика утверждена» = статус `approved` в реестре (тело запроса на это не влияет).
 */
export function checkPinnedMethodology(
  audit: {
    methodologyId: string | null;
    methodologySha256: string | null;
    methodologyVersion: string;
    protocolVersion: string;
    criteriaVersion: string;
  },
  methodology: PinnableMethodology | null,
): PinnedMethodologyCheck {
  if (!audit.methodologyId || !audit.methodologySha256 || !methodology || methodology.id !== audit.methodologyId) {
    return {
      ok: false,
      error: "assessment_not_pinned",
      message: "assessment is not pinned to a registry methodology; create a new assessment",
    };
  }
  if (methodology.definitionSha256 !== audit.methodologySha256) {
    return {
      ok: false,
      error: "methodology_changed_since_assessment",
      message: `methodology ${methodology.id} definition changed after the assessment was created; create a new assessment`,
    };
  }
  if (computeDefinitionSha256(methodology.definition) !== methodology.definitionSha256) {
    return {
      ok: false,
      error: "methodology_integrity_failed",
      message: `stored definition of ${methodology.id} does not match its sha256`,
    };
  }
  if (
    audit.methodologyVersion !== methodology.methodologyVersion ||
    audit.protocolVersion !== methodology.protocolVersion ||
    audit.criteriaVersion !== methodology.criteriaVersion ||
    !definitionMatchesEngine(methodology.definition)
  ) {
    return {
      ok: false,
      error: "methodology_engine_mismatch",
      message: `methodology ${methodology.id} does not match the assessment versions or the rating engine`,
    };
  }
  return { ok: true, approved: methodology.status === "approved", ratingVersion: methodology.ratingVersion };
}
