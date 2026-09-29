export const SPOT_RATING_METHODOLOGY_VERSION = "v1.1" as const;

export const SPOT_RATING_WEIGHTS = {
  infrastructure: 25,
  instrument: 25,
  waterArea: 15,
  personnel: 15,
  safety: 10,
  atmosphere: 10,
} as const;

export type SpotRatingCategory = keyof typeof SPOT_RATING_WEIGHTS;
export type GateStatus = "pass" | "fail" | "unknown";

export const SPOT_MANDATORY_GATES = {
  G01: "working_instrument",
  G02: "safe_water_area",
  G03: "closed_changing_room",
  G04: "toilet",
  G05: "hot_shower",
  G06: "safety_briefing",
  G07: "first_aid_and_rescue",
  G08: "safety_system",
} as const;

export type SpotMandatoryGateId = keyof typeof SPOT_MANDATORY_GATES;

export type SpotRatingBand =
  | "premium_plus"
  | "premium"
  | "standard"
  | "basic"
  | "below_standard";

export const SPOT_RATING_BAND_LABEL_RU: Record<SpotRatingBand, string> = {
  premium_plus: "Премиум+",
  premium: "Премиум",
  standard: "Стандарт",
  basic: "Базовый",
  below_standard: "Ниже стандарта",
};

export type SpotRatingBlocker =
  | "methodology_not_approved"
  | "professional_test_missing"
  | "expert_signature_missing"
  | "criterion_evidence_missing"
  | "evidence_integrity_not_confirmed"
  | "test_expired"
  | "related_spot_external_expert_missing"
  | "related_spot_independent_editor_missing"
  | `mandatory_gate_failed:${SpotMandatoryGateId}`
  | `mandatory_gate_unknown:${SpotMandatoryGateId}`;

export interface SpotRatingVersions {
  methodologyVersion: string;
  protocolVersion: string;
  criteriaVersion: string;
  ratingVersion: string;
}

export interface SpotRatingInput extends SpotRatingVersions {
  categoryScores: Record<SpotRatingCategory, number>;
  mandatoryGates: Record<SpotMandatoryGateId, GateStatus>;
  methodologyApprovedForPublication: boolean;
  professionalTestCompleted: boolean;
  expertSigned: boolean;
  criterionEvidenceComplete: boolean;
  evidenceIntegrityConfirmed: boolean;
  testedAt: Date;
  asOf?: Date;
  relatedToMyWave: boolean;
  externalExpertConfirmed?: boolean;
  independentEditorConfirmed?: boolean;
}

export interface SpotRatingResult extends SpotRatingVersions {
  officialScore: number | null;
  band: SpotRatingBand | null;
  bandLabelRu: string | null;
  publishable: boolean;
  blockers: SpotRatingBlocker[];
  expiresAt: Date;
}

type ParsedDecimal = {
  integer: bigint;
  fractionalDigits: number;
};

function parseNonNegativeDecimal(value: number): ParsedDecimal {
  if (!Number.isFinite(value) || value < 0) {
    throw new Error("rating score must be a finite non-negative number");
  }

  const source = String(value).toLowerCase();
  const match = source.match(/^(\d+)(?:\.(\d+))?(?:e([+-]?\d+))?$/);
  if (!match) throw new Error(`unsupported rating score: ${source}`);

  const integerPart = match[1];
  const fractionalPart = match[2] ?? "";
  const exponent = Number(match[3] ?? "0");
  const digits = (integerPart + fractionalPart).replace(/^0+(?=\d)/, "");
  const initialDecimalPosition = integerPart.length;
  const decimalPosition = initialDecimalPosition + exponent;

  if (decimalPosition >= digits.length) {
    const integer = BigInt(digits + "0".repeat(decimalPosition - digits.length));
    return { integer, fractionalDigits: 0 };
  }

  if (decimalPosition <= 0) {
    const padded = "0".repeat(-decimalPosition) + digits;
    return { integer: BigInt(padded || "0"), fractionalDigits: padded.length };
  }

  return {
    integer: BigInt(digits || "0"),
    fractionalDigits: digits.length - decimalPosition,
  };
}

function powerOfTen(exp: number): bigint {
  return 10n ** BigInt(exp);
}

function roundHalfUpWeightedScore(categoryScores: Record<SpotRatingCategory, number>): number {
  const categories = Object.keys(SPOT_RATING_WEIGHTS) as SpotRatingCategory[];
  const parsed = categories.map((category) => {
    const score = categoryScores[category];
    if (score > 10) throw new Error(`${category} score must be between 0 and 10`);
    return { category, parsed: parseNonNegativeDecimal(score) };
  });

  const maxFractionalDigits = Math.max(...parsed.map((item) => item.parsed.fractionalDigits));
  const commonScale = powerOfTen(maxFractionalDigits);

  let weightedNumerator = 0n;
  for (const item of parsed) {
    const scaledScore =
      item.parsed.integer * powerOfTen(maxFractionalDigits - item.parsed.fractionalDigits);
    weightedNumerator += scaledScore * BigInt(SPOT_RATING_WEIGHTS[item.category]);
  }

  const denominator = commonScale * 100n;
  const roundedTenths = (weightedNumerator * 10n + denominator / 2n) / denominator;
  return Number(roundedTenths) / 10;
}

function addCalendarMonthsClamped(date: Date, months: number): Date {
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth();
  const day = date.getUTCDate();
  const targetFirst = new Date(Date.UTC(year, month + months, 1, date.getUTCHours(), date.getUTCMinutes(), date.getUTCSeconds(), date.getUTCMilliseconds()));
  const endOfTargetMonth = new Date(
    Date.UTC(targetFirst.getUTCFullYear(), targetFirst.getUTCMonth() + 1, 0),
  ).getUTCDate();
  targetFirst.setUTCDate(Math.min(day, endOfTargetMonth));
  return targetFirst;
}

export function resolveSpotRatingBand(score: number): SpotRatingBand {
  if (score >= 9) return "premium_plus";
  if (score >= 7.5) return "premium";
  if (score >= 6) return "standard";
  if (score >= 4) return "basic";
  return "below_standard";
}

export function evaluateSpotRating(input: SpotRatingInput): SpotRatingResult {
  if (input.methodologyVersion.trim() === "" || input.protocolVersion.trim() === "" ||
      input.criteriaVersion.trim() === "" || input.ratingVersion.trim() === "") {
    throw new Error("all rating versions are required");
  }

  const blockers: SpotRatingBlocker[] = [];
  if (!input.methodologyApprovedForPublication) blockers.push("methodology_not_approved");
  if (!input.professionalTestCompleted) blockers.push("professional_test_missing");
  if (!input.expertSigned) blockers.push("expert_signature_missing");
  if (!input.criterionEvidenceComplete) blockers.push("criterion_evidence_missing");
  if (!input.evidenceIntegrityConfirmed) blockers.push("evidence_integrity_not_confirmed");

  for (const gateId of Object.keys(SPOT_MANDATORY_GATES) as SpotMandatoryGateId[]) {
    const status = input.mandatoryGates[gateId];
    if (status === "fail") blockers.push(`mandatory_gate_failed:${gateId}`);
    if (status === "unknown") blockers.push(`mandatory_gate_unknown:${gateId}`);
  }

  if (input.relatedToMyWave) {
    if (!input.externalExpertConfirmed) blockers.push("related_spot_external_expert_missing");
    if (!input.independentEditorConfirmed) blockers.push("related_spot_independent_editor_missing");
  }

  const expiresAt = addCalendarMonthsClamped(input.testedAt, 12);
  const asOf = input.asOf ?? new Date();
  if (asOf.getTime() >= expiresAt.getTime()) blockers.push("test_expired");

  const publishable = blockers.length === 0;
  const officialScore = publishable ? roundHalfUpWeightedScore(input.categoryScores) : null;
  const band = officialScore == null ? null : resolveSpotRatingBand(officialScore);

  return {
    methodologyVersion: input.methodologyVersion,
    protocolVersion: input.protocolVersion,
    criteriaVersion: input.criteriaVersion,
    ratingVersion: input.ratingVersion,
    officialScore,
    band,
    bandLabelRu: band == null ? null : SPOT_RATING_BAND_LABEL_RU[band],
    publishable,
    blockers,
    expiresAt,
  };
}

export interface HotShowerRemediationInput {
  gateId: SpotMandatoryGateId;
  evidenceFileId: string | null;
  moderatorId: string | null;
  rationale: string | null;
  moderatorVerifiedWorkingHotWater: boolean;
}

export interface HotShowerRemediationResult {
  accepted: boolean;
  gateStatus: GateStatus;
  reasons: string[];
}

export function evaluateRemoteGateRemediation(
  input: HotShowerRemediationInput,
): HotShowerRemediationResult {
  if (input.gateId !== "G05") {
    return {
      accepted: false,
      gateStatus: "unknown",
      reasons: ["remote_remediation_is_only_allowed_for_G05_hot_shower"],
    };
  }

  const reasons: string[] = [];
  if (!input.evidenceFileId?.trim()) reasons.push("evidence_file_required");
  if (!input.moderatorId?.trim()) reasons.push("moderator_required");
  if (!input.rationale?.trim()) reasons.push("moderator_rationale_required");
  if (!input.moderatorVerifiedWorkingHotWater) reasons.push("working_hot_water_not_verified");

  return {
    accepted: reasons.length === 0,
    gateStatus: reasons.length === 0 ? "pass" : "unknown",
    reasons,
  };
}
