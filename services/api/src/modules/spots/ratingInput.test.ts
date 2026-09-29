import { describe, expect, it } from "vitest";
import { SPOT_MANDATORY_GATES, SPOT_RATING_WEIGHTS, evaluateSpotRating } from "./ratingEngine";
import { buildSpotRatingInput, type SpotAuditRow } from "./ratingInput";

const CATEGORIES = Object.keys(SPOT_RATING_WEIGHTS);
const GATES = Object.keys(SPOT_MANDATORY_GATES);

function fullAudit(overrides: Partial<SpotAuditRow> = {}): SpotAuditRow {
  return {
    testedAt: new Date("2026-06-01T10:00:00Z"),
    methodologyVersion: "v1.1",
    protocolVersion: "wakesurf-v1.1",
    criteriaVersion: "wakesurf-v1.1",
    status: "signed",
    expertUserId: "expert-1",
    expertSignedAt: new Date("2026-06-02T10:00:00Z"),
    externalExpertConfirmed: false,
    independentEditorUserId: null,
    categoryScores: CATEGORIES.map((category) => ({ category, score: "8.0" })),
    gateResults: GATES.map((gateId) => ({ gateId, status: "pass" })),
    evidence: CATEGORIES.map((category, i) => ({
      id: `ev-${i}`,
      criterion: category,
      isGenerated: false,
      integrityConfirmedAt: new Date("2026-06-03T10:00:00Z"),
    })),
    remediations: [],
    ...overrides,
  };
}

const options = {
  relatedToMyWave: false,
  ratingVersion: "rating-v1.1",
  methodologyApprovedForPublication: true,
  asOf: new Date("2026-07-01T00:00:00Z"),
};

function build(audit: SpotAuditRow, opts: Partial<typeof options> = {}) {
  const result = buildSpotRatingInput(audit, { ...options, ...opts });
  if (!result.ok) throw new Error(result.error);
  return result.input;
}

describe("buildSpotRatingInput", () => {
  it("builds a publishable input from a complete signed audit", () => {
    const input = build(fullAudit());
    expect(input.categoryScores.infrastructure).toBe(8);
    expect(input.professionalTestCompleted).toBe(true);
    expect(input.expertSigned).toBe(true);
    expect(input.criterionEvidenceComplete).toBe(true);
    expect(input.evidenceIntegrityConfirmed).toBe(true);
    const rating = evaluateSpotRating(input);
    expect(rating.publishable).toBe(true);
    expect(rating.officialScore).toBe(8);
  });

  it("reports missing category scores instead of guessing", () => {
    const audit = fullAudit({
      categoryScores: CATEGORIES.filter((c) => c !== "safety").map((category) => ({
        category,
        score: 7,
      })),
    });
    const result = buildSpotRatingInput(audit, options);
    expect(result).toEqual({
      ok: false,
      error: "category_scores_incomplete",
      missingCategories: ["safety"],
    });
  });

  it("treats a missing or malformed gate result as unknown", () => {
    const gateResults = GATES.filter((g) => g !== "G03").map((gateId) => ({
      gateId,
      status: gateId === "G04" ? "maybe" : "pass",
    }));
    const input = build(fullAudit({ gateResults }));
    expect(input.mandatoryGates.G03).toBe("unknown");
    expect(input.mandatoryGates.G04).toBe("unknown");
    expect(evaluateSpotRating(input).blockers).toContain("mandatory_gate_unknown:G03");
  });

  it("turns G05 into pass only with an accepted remediation on authentic evidence", () => {
    const gateResults = GATES.map((gateId) => ({
      gateId,
      status: gateId === "G05" ? "unknown" : "pass",
    }));
    const accepted = build(
      fullAudit({ gateResults, remediations: [{ gateId: "G05", evidenceId: "ev-0", accepted: true }] }),
    );
    expect(accepted.mandatoryGates.G05).toBe("pass");

    const rejected = build(
      fullAudit({ gateResults, remediations: [{ gateId: "G05", evidenceId: "ev-0", accepted: false }] }),
    );
    expect(rejected.mandatoryGates.G05).toBe("unknown");

    const unknownEvidence = build(
      fullAudit({ gateResults, remediations: [{ gateId: "G05", evidenceId: "nope", accepted: true }] }),
    );
    expect(unknownEvidence.mandatoryGates.G05).toBe("unknown");
  });

  it("never remediates gates other than G05", () => {
    const gateResults = GATES.map((gateId) => ({
      gateId,
      status: gateId === "G02" ? "fail" : "pass",
    }));
    const input = build(
      fullAudit({ gateResults, remediations: [{ gateId: "G02", evidenceId: "ev-0", accepted: true }] }),
    );
    expect(input.mandatoryGates.G02).toBe("fail");
  });

  it("requires signed status, expert and signature date for expertSigned", () => {
    expect(build(fullAudit({ status: "submitted" })).expertSigned).toBe(false);
    expect(build(fullAudit({ expertSignedAt: null })).expertSigned).toBe(false);
    expect(build(fullAudit({ expertUserId: null })).expertSigned).toBe(false);
  });

  it("does not count draft or void audits as a completed professional test", () => {
    expect(build(fullAudit({ status: "draft" })).professionalTestCompleted).toBe(false);
    expect(build(fullAudit({ status: "void" })).professionalTestCompleted).toBe(false);
  });

  it("rejects generated evidence for criteria and integrity", () => {
    const evidence = fullAudit().evidence.map((row, i) => (i === 0 ? { ...row, isGenerated: true } : row));
    const input = build(fullAudit({ evidence }));
    expect(input.criterionEvidenceComplete).toBe(false);
    expect(input.evidenceIntegrityConfirmed).toBe(false);
  });

  it("requires integrity confirmation on every evidence item and at least one item", () => {
    const evidence = fullAudit().evidence.map((row, i) =>
      i === 2 ? { ...row, integrityConfirmedAt: null } : row,
    );
    expect(build(fullAudit({ evidence })).evidenceIntegrityConfirmed).toBe(false);
    expect(build(fullAudit({ evidence: [] })).evidenceIntegrityConfirmed).toBe(false);
  });

  it("requires an editor different from the expert for related spots", () => {
    const sameUser = build(fullAudit({ independentEditorUserId: "expert-1" }), { relatedToMyWave: true });
    expect(sameUser.independentEditorConfirmed).toBe(false);
    expect(evaluateSpotRating(sameUser).blockers).toContain("related_spot_independent_editor_missing");

    const other = build(
      fullAudit({ independentEditorUserId: "editor-2", externalExpertConfirmed: true }),
      { relatedToMyWave: true },
    );
    expect(other.independentEditorConfirmed).toBe(true);
    expect(evaluateSpotRating(other).publishable).toBe(true);
  });
});
