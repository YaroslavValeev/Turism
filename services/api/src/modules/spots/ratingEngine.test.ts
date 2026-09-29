import { describe, expect, it } from "vitest";
import {
  SPOT_MANDATORY_GATES,
  SPOT_RATING_METHODOLOGY_VERSION,
  evaluateRemoteGateRemediation,
  evaluateSpotRating,
  resolveSpotRatingBand,
  type SpotRatingInput,
} from "./ratingEngine";

function validInput(overrides: Partial<SpotRatingInput> = {}): SpotRatingInput {
  return {
    methodologyVersion: SPOT_RATING_METHODOLOGY_VERSION,
    protocolVersion: "wakesurf-v1.1",
    criteriaVersion: "wakesurf-v1.1-candidate",
    ratingVersion: "rating-v1",
    categoryScores: {
      infrastructure: 9.2,
      instrument: 8.8,
      waterArea: 8.4,
      personnel: 9.1,
      safety: 9.6,
      atmosphere: 8.7,
    },
    mandatoryGates: Object.fromEntries(
      Object.keys(SPOT_MANDATORY_GATES).map((id) => [id, "pass"]),
    ) as SpotRatingInput["mandatoryGates"],
    methodologyApprovedForPublication: true,
    professionalTestCompleted: true,
    expertSigned: true,
    criterionEvidenceComplete: true,
    evidenceIntegrityConfirmed: true,
    testedAt: new Date("2026-09-01T10:00:00.000Z"),
    asOf: new Date("2026-09-29T10:00:00.000Z"),
    relatedToMyWave: false,
    ...overrides,
  };
}

describe("spot rating engine v1.1", () => {
  it("uses the approved 25/25/15/15/10/10 weights and ROUND_HALF_UP once", () => {
    const result = evaluateSpotRating(validInput());
    // 9.2*.25 + 8.8*.25 + 8.4*.15 + 9.1*.15 + 9.6*.10 + 8.7*.10 = 8.955
    expect(result.publishable).toBe(true);
    expect(result.officialScore).toBe(9.0);
    expect(result.band).toBe("premium_plus");
    expect(result.bandLabelRu).toBe("Премиум+");
  });

  it("does not turn an unknown mandatory gate into zero and blocks official publication", () => {
    const input = validInput();
    input.mandatoryGates.G05 = "unknown";
    const result = evaluateSpotRating(input);

    expect(result.publishable).toBe(false);
    expect(result.officialScore).toBeNull();
    expect(result.band).toBeNull();
    expect(result.blockers).toContain("mandatory_gate_unknown:G05");
  });

  it("does not allow a high average to compensate a failed mandatory gate", () => {
    const input = validInput({
      categoryScores: {
        infrastructure: 10,
        instrument: 10,
        waterArea: 10,
        personnel: 10,
        safety: 10,
        atmosphere: 10,
      },
    });
    input.mandatoryGates.G08 = "fail";
    const result = evaluateSpotRating(input);

    expect(result.officialScore).toBeNull();
    expect(result.blockers).toContain("mandatory_gate_failed:G08");
  });

  it("requires a real professional test, evidence and expert signature", () => {
    const result = evaluateSpotRating(
      validInput({
        professionalTestCompleted: false,
        expertSigned: false,
        criterionEvidenceComplete: false,
        evidenceIntegrityConfirmed: false,
      }),
    );
    expect(result.publishable).toBe(false);
    expect(result.blockers).toEqual(
      expect.arrayContaining([
        "professional_test_missing",
        "expert_signature_missing",
        "criterion_evidence_missing",
        "evidence_integrity_not_confirmed",
      ]),
    );
  });

  it("requires independent review for a MyWave-related spot", () => {
    const result = evaluateSpotRating(
      validInput({
        relatedToMyWave: true,
        externalExpertConfirmed: false,
        independentEditorConfirmed: false,
      }),
    );
    expect(result.publishable).toBe(false);
    expect(result.blockers).toEqual(
      expect.arrayContaining([
        "related_spot_external_expert_missing",
        "related_spot_independent_editor_missing",
      ]),
    );
  });

  it("expires the official test after 12 calendar months", () => {
    const result = evaluateSpotRating(
      validInput({
        testedAt: new Date("2025-09-29T10:00:00.000Z"),
        asOf: new Date("2026-09-29T10:00:00.000Z"),
      }),
    );
    expect(result.publishable).toBe(false);
    expect(result.blockers).toContain("test_expired");
  });

  it("uses the shown rounded score to choose the public category", () => {
    expect(resolveSpotRatingBand(9.0)).toBe("premium_plus");
    expect(resolveSpotRatingBand(8.9)).toBe("premium");
    expect(resolveSpotRatingBand(7.5)).toBe("premium");
    expect(resolveSpotRatingBand(7.4)).toBe("standard");
    expect(resolveSpotRatingBand(6.0)).toBe("standard");
    expect(resolveSpotRatingBand(5.9)).toBe("basic");
    expect(resolveSpotRatingBand(4.0)).toBe("basic");
    expect(resolveSpotRatingBand(3.9)).toBe("below_standard");
  });

  it("allows remote remediation only for G05 and only after moderator verifies working hot water", () => {
    expect(
      evaluateRemoteGateRemediation({
        gateId: "G05",
        evidenceFileId: "media_1",
        moderatorId: "editor_1",
        rationale: "Проверена работа горячей воды на площадке.",
        moderatorVerifiedWorkingHotWater: true,
      }),
    ).toEqual({ accepted: true, gateStatus: "pass", reasons: [] });

    expect(
      evaluateRemoteGateRemediation({
        gateId: "G08",
        evidenceFileId: "media_2",
        moderatorId: "editor_1",
        rationale: "Попытка закрыть безопасность дистанционно.",
        moderatorVerifiedWorkingHotWater: true,
      }),
    ).toEqual({
      accepted: false,
      gateStatus: "unknown",
      reasons: ["remote_remediation_is_only_allowed_for_G05_hot_shower"],
    });
  });

  it("does not accept a shower photo without verification that hot water actually works", () => {
    const result = evaluateRemoteGateRemediation({
      gateId: "G05",
      evidenceFileId: "photo_of_shower",
      moderatorId: "editor_1",
      rationale: "Есть фото установки.",
      moderatorVerifiedWorkingHotWater: false,
    });
    expect(result.accepted).toBe(false);
    expect(result.gateStatus).toBe("unknown");
    expect(result.reasons).toContain("working_hot_water_not_verified");
  });
});
