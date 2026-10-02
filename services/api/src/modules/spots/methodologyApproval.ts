import { computeDefinitionSha256 } from "./methodologyRegistry";
import { definitionMatchesEngine, type PinnableMethodology } from "./methodologyPin";

export type MethodologyApprovalPlan =
  | { ok: true; definitionSha256: string }
  | {
      ok: false;
      status: 400 | 409;
      code:
        | "expected_sha256_required"
        | "methodology_not_draft"
        | "methodology_integrity_failed"
        | "methodology_sha256_mismatch"
        | "methodology_engine_mismatch";
      error: string;
    };

const SHA256_RE = /^[0-9a-f]{64}$/;

/**
 * Утверждение draft → approved. Владелец подтверждает конкретную версию: `expectedSha256`
 * из запроса должен совпасть с хешем в реестре, а хеш — с пересчитанным по определению.
 * Утверждается только то, что умеет считать движок рейтинга.
 */
export function planSpotMethodologyApproval(
  methodology: PinnableMethodology,
  expectedSha256: unknown,
): MethodologyApprovalPlan {
  const expected = typeof expectedSha256 === "string" ? expectedSha256.trim().toLowerCase() : "";
  if (!SHA256_RE.test(expected)) {
    return {
      ok: false,
      status: 400,
      code: "expected_sha256_required",
      error: "expectedSha256 (64 hex chars) of the version being approved is required",
    };
  }
  if (methodology.status !== "draft") {
    return {
      ok: false,
      status: 409,
      code: "methodology_not_draft",
      error: `methodology ${methodology.id} is ${methodology.status}; only draft can be approved`,
    };
  }
  const definition = methodology.definition as Record<string, unknown> | null;
  const columnsMatch =
    definition !== null &&
    typeof definition === "object" &&
    definition.discipline === methodology.discipline &&
    definition.methodologyVersion === methodology.methodologyVersion &&
    definition.protocolVersion === methodology.protocolVersion &&
    definition.criteriaVersion === methodology.criteriaVersion &&
    definition.ratingVersion === methodology.ratingVersion;
  if (!columnsMatch || computeDefinitionSha256(methodology.definition) !== methodology.definitionSha256) {
    return {
      ok: false,
      status: 409,
      code: "methodology_integrity_failed",
      error: `stored definition of ${methodology.id} does not match its sha256 or version columns`,
    };
  }
  if (expected !== methodology.definitionSha256) {
    return {
      ok: false,
      status: 409,
      code: "methodology_sha256_mismatch",
      error: `methodology ${methodology.id} has sha256 ${methodology.definitionSha256.slice(0, 12)}…, not ${expected.slice(0, 12)}…; reload and check the version`,
    };
  }
  if (!definitionMatchesEngine(methodology.definition)) {
    return {
      ok: false,
      status: 409,
      code: "methodology_engine_mismatch",
      error: `methodology ${methodology.id} does not match the rating engine`,
    };
  }
  return { ok: true, definitionSha256: methodology.definitionSha256 };
}
