import {
  SPOT_MANDATORY_GATES,
  SPOT_RATING_WEIGHTS,
  type GateStatus,
  type SpotMandatoryGateId,
  type SpotRatingCategory,
  type SpotRatingInput,
} from "./ratingEngine";

type DecimalLike = number | string | { toString(): string };

export interface SpotAuditRow {
  testedAt: Date;
  methodologyVersion: string;
  protocolVersion: string;
  criteriaVersion: string;
  status: string;
  expertUserId: string | null;
  expertSignedAt: Date | null;
  externalExpertConfirmed: boolean;
  independentEditorUserId: string | null;
  categoryScores: Array<{ category: string; score: DecimalLike }>;
  gateResults: Array<{ gateId: string; status: string }>;
  evidence: Array<{
    id: string;
    criterion: string | null;
    isGenerated: boolean;
    integrityConfirmedAt: Date | null;
  }>;
  remediations: Array<{ gateId: string; evidenceId: string; accepted: boolean }>;
}

export interface BuildSpotRatingInputOptions {
  relatedToMyWave: boolean;
  ratingVersion: string;
  methodologyApprovedForPublication: boolean;
  asOf?: Date;
}

export type BuildSpotRatingInputResult =
  | { ok: true; input: SpotRatingInput }
  | { ok: false; error: "category_scores_incomplete"; missingCategories: SpotRatingCategory[] };

const CATEGORIES = Object.keys(SPOT_RATING_WEIGHTS) as SpotRatingCategory[];
const GATE_IDS = Object.keys(SPOT_MANDATORY_GATES) as SpotMandatoryGateId[];

function isGateStatus(value: string): value is GateStatus {
  return value === "pass" || value === "fail" || value === "unknown";
}

function toScore(value: DecimalLike): number {
  const n = typeof value === "number" ? value : Number(value.toString());
  if (!Number.isFinite(n)) throw new Error(`invalid category score: ${String(value)}`);
  return n;
}

export function buildSpotRatingInput(
  audit: SpotAuditRow,
  options: BuildSpotRatingInputOptions,
): BuildSpotRatingInputResult {
  const scoreByCategory = new Map(audit.categoryScores.map((row) => [row.category, row.score]));
  const missingCategories = CATEGORIES.filter((category) => !scoreByCategory.has(category));
  if (missingCategories.length > 0) {
    return { ok: false, error: "category_scores_incomplete", missingCategories };
  }
  const categoryScores = Object.fromEntries(
    CATEGORIES.map((category) => [category, toScore(scoreByCategory.get(category)!)]),
  ) as Record<SpotRatingCategory, number>;

  const gateById = new Map(audit.gateResults.map((row) => [row.gateId, row.status]));
  const authenticEvidenceIds = new Set(
    audit.evidence.filter((row) => !row.isGenerated).map((row) => row.id),
  );
  const g05Remediated = audit.remediations.some(
    (row) => row.gateId === "G05" && row.accepted && authenticEvidenceIds.has(row.evidenceId),
  );

  const mandatoryGates = Object.fromEntries(
    GATE_IDS.map((gateId) => {
      if (gateId === "G05" && g05Remediated) return [gateId, "pass"];
      const raw = gateById.get(gateId);
      return [gateId, raw && isGateStatus(raw) ? raw : "unknown"];
    }),
  ) as Record<SpotMandatoryGateId, GateStatus>;

  const criterionEvidenceComplete = CATEGORIES.every((category) =>
    audit.evidence.some((row) => row.criterion === category && !row.isGenerated),
  );
  const evidenceIntegrityConfirmed =
    audit.evidence.length > 0 &&
    audit.evidence.every((row) => !row.isGenerated && row.integrityConfirmedAt != null);

  return {
    ok: true,
    input: {
      methodologyVersion: audit.methodologyVersion,
      protocolVersion: audit.protocolVersion,
      criteriaVersion: audit.criteriaVersion,
      ratingVersion: options.ratingVersion,
      categoryScores,
      mandatoryGates,
      methodologyApprovedForPublication: options.methodologyApprovedForPublication,
      professionalTestCompleted: audit.status === "submitted" || audit.status === "signed",
      expertSigned:
        audit.status === "signed" && audit.expertUserId != null && audit.expertSignedAt != null,
      criterionEvidenceComplete,
      evidenceIntegrityConfirmed,
      testedAt: audit.testedAt,
      asOf: options.asOf,
      relatedToMyWave: options.relatedToMyWave,
      externalExpertConfirmed: audit.externalExpertConfirmed,
      independentEditorConfirmed:
        audit.independentEditorUserId != null &&
        audit.independentEditorUserId !== audit.expertUserId,
    },
  };
}
