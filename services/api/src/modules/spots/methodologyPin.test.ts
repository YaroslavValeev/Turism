import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { computeDefinitionSha256, type SpotMethodologyDefinition } from "./methodologyRegistry";
import { checkPinnedMethodology, planAssessmentMethodologyPin, type PinnableMethodology } from "./methodologyPin";

const wakesurfFile = path.resolve(__dirname, "../../../prisma/data/spot-methodology/wakesurf-v1.1.json");
const definition = JSON.parse(readFileSync(wakesurfFile, "utf8")) as SpotMethodologyDefinition;
const sha = computeDefinitionSha256(definition);

function methodology(overrides: Partial<PinnableMethodology> = {}): PinnableMethodology {
  return {
    id: "spotmeth_wakesurf_v1_1",
    discipline: "wakesurf",
    methodologyVersion: "v1.1",
    protocolVersion: "wakesurf-v1.1",
    criteriaVersion: "wakesurf-v1.1",
    ratingVersion: "wakesurf-v1.1",
    status: "draft",
    definition,
    definitionSha256: sha,
    ...overrides,
  };
}

const pinnedAudit = {
  methodologyId: "spotmeth_wakesurf_v1_1",
  methodologySha256: sha,
  methodologyVersion: "v1.1",
  protocolVersion: "wakesurf-v1.1",
  criteriaVersion: "wakesurf-v1.1",
};

describe("planAssessmentMethodologyPin", () => {
  it("copies versions and sha256 from the registry row", () => {
    expect(planAssessmentMethodologyPin(methodology(), "wakesurf", {})).toEqual({
      ok: true,
      pin: {
        methodologyId: "spotmeth_wakesurf_v1_1",
        methodologySha256: sha,
        methodologyVersion: "v1.1",
        protocolVersion: "wakesurf-v1.1",
        criteriaVersion: "wakesurf-v1.1",
      },
    });
  });

  it("allows draft and approved, refuses retired, missing and foreign-discipline methodologies", () => {
    expect(planAssessmentMethodologyPin(methodology({ status: "approved" }), "wakesurf", {}).ok).toBe(true);
    expect(planAssessmentMethodologyPin(methodology({ status: "retired" }), "wakesurf", {})).toMatchObject({ ok: false, status: 409 });
    expect(planAssessmentMethodologyPin(null, "wakesurf", {})).toMatchObject({ ok: false, status: 404 });
    expect(planAssessmentMethodologyPin(methodology(), "kitesurf", {})).toMatchObject({ ok: false, status: 400 });
  });

  it("rejects requested versions that differ from the methodology", () => {
    const plan = planAssessmentMethodologyPin(methodology(), "wakesurf", { protocolVersion: "wakesurf-v1.0" });
    expect(plan).toMatchObject({ ok: false, status: 400, error: expect.stringMatching(/protocolVersion/) });
  });
});

describe("checkPinnedMethodology", () => {
  it("reads approval from the registry status and the rating version from the methodology", () => {
    expect(checkPinnedMethodology(pinnedAudit, methodology({ status: "approved" }))).toEqual({
      ok: true,
      approved: true,
      ratingVersion: "wakesurf-v1.1",
    });
    expect(checkPinnedMethodology(pinnedAudit, methodology())).toMatchObject({ ok: true, approved: false });
    expect(checkPinnedMethodology(pinnedAudit, methodology({ status: "retired" }))).toMatchObject({ ok: true, approved: false });
  });

  it("refuses assessments created before D3", () => {
    const legacy = { ...pinnedAudit, methodologyId: null, methodologySha256: null };
    expect(checkPinnedMethodology(legacy, null)).toMatchObject({ ok: false, error: "assessment_not_pinned" });
    expect(checkPinnedMethodology(pinnedAudit, methodology({ id: "spotmeth_other" }))).toMatchObject({
      ok: false,
      error: "assessment_not_pinned",
    });
  });

  it("refuses when the draft definition changed after the assessment was created", () => {
    const changed = { ...definition, validityMonths: 6 };
    const result = checkPinnedMethodology(
      pinnedAudit,
      methodology({ definition: changed, definitionSha256: computeDefinitionSha256(changed) }),
    );
    expect(result).toMatchObject({ ok: false, error: "methodology_changed_since_assessment" });
  });

  it("refuses a stored definition that does not match its own sha256", () => {
    const tampered = { ...definition, rounding: "ROUND_DOWN" };
    expect(checkPinnedMethodology(pinnedAudit, methodology({ definition: tampered }))).toMatchObject({
      ok: false,
      error: "methodology_integrity_failed",
    });
  });

  it("refuses a definition that the rating engine does not implement", () => {
    const criteria = definition.criteria.map((c) =>
      c.code === "safety" ? { ...c, weight: 15 } : c.code === "atmosphere" ? { ...c, weight: 5 } : c,
    );
    const reweighted = { ...definition, criteria };
    const reweightedSha = computeDefinitionSha256(reweighted);
    const result = checkPinnedMethodology(
      { ...pinnedAudit, methodologySha256: reweightedSha },
      methodology({ definition: reweighted, definitionSha256: reweightedSha }),
    );
    expect(result).toMatchObject({ ok: false, error: "methodology_engine_mismatch" });
    expect(
      checkPinnedMethodology({ ...pinnedAudit, criteriaVersion: "wakesurf-v1.0" }, methodology()),
    ).toMatchObject({ ok: false, error: "methodology_engine_mismatch" });
  });
});
