import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  buildSpotMethodologyId,
  canonicalJsonStringify,
  computeDefinitionSha256,
  parseSpotMethodologyDefinition,
  planSpotMethodologyAction,
} from "./methodologyRegistry";
import {
  SPOT_MANDATORY_GATES,
  SPOT_RATING_BAND_LABEL_RU,
  SPOT_RATING_METHODOLOGY_VERSION,
  SPOT_RATING_WEIGHTS,
  resolveSpotRatingBand,
} from "./ratingEngine";

const wakesurfFile = path.resolve(__dirname, "../../../prisma/data/spot-methodology/wakesurf-v1.1.json");
const definition = parseSpotMethodologyDefinition(JSON.parse(readFileSync(wakesurfFile, "utf8")));

describe("wakesurf-v1.1 methodology definition", () => {
  it("matches engine version and deterministic id", () => {
    expect(definition.methodologyVersion).toBe(SPOT_RATING_METHODOLOGY_VERSION);
    expect(definition.discipline).toBe("wakesurf");
    expect(definition.protocolVersion).toBe("wakesurf-v1.1");
    expect(definition.criteriaVersion).toBe("wakesurf-v1.1");
    expect(definition.ratingVersion).toBe("wakesurf-v1.1");
    expect(buildSpotMethodologyId(definition.discipline, definition.methodologyVersion)).toBe(
      "spotmeth_wakesurf_v1_1",
    );
  });

  it("has criteria weights equal to engine weights, summing to 100", () => {
    const weights = Object.fromEntries(definition.criteria.map((c) => [c.code, c.weight]));
    expect(weights).toEqual(SPOT_RATING_WEIGHTS);
    expect(definition.criteria.reduce((sum, c) => sum + c.weight, 0)).toBe(100);
    for (const criterion of definition.criteria) {
      expect(criterion.scoreBearing).toBe(true);
      expect(criterion.evidenceRequired.length).toBeGreaterThan(0);
      expect(criterion.guidance.length).toBeGreaterThan(0);
    }
  });

  it("has exactly the engine mandatory gates; only G05 is remotely remediable", () => {
    const gates = Object.fromEntries(definition.gates.map((g) => [g.code, g.key]));
    expect(gates).toEqual(SPOT_MANDATORY_GATES);
    expect(definition.gates.filter((g) => g.remoteRemediable).map((g) => g.code)).toEqual(["G05"]);
    expect(definition.gatePolicy).toEqual({ unknownIsZero: false, failOrUnknownBlocks: true });
  });

  it("has bands equal to engine thresholds and labels", () => {
    expect(new Set(definition.bands.map((b) => b.code))).toEqual(
      new Set(Object.keys(SPOT_RATING_BAND_LABEL_RU)),
    );
    for (const band of definition.bands) {
      expect(band.labelRu).toBe(SPOT_RATING_BAND_LABEL_RU[band.code as keyof typeof SPOT_RATING_BAND_LABEL_RU]);
      expect(resolveSpotRatingBand(band.minScore)).toBe(band.code);
      if (band.minScore > 0) {
        expect(resolveSpotRatingBand(Math.round((band.minScore - 0.1) * 10) / 10)).not.toBe(band.code);
      }
    }
  });

  it("fixes validity, scale, rounding and owner policies", () => {
    expect(definition.validityMonths).toBe(12);
    expect(definition.rounding).toBe("ROUND_HALF_UP_1");
    expect(definition.scale).toEqual({ min: 0, max: 10, step: 0.1 });
    expect(definition.equipmentSchema.required).toEqual(["boat", "model", "ballast"]);
    expect(definition.relatedSpotRules).toEqual({ externalExpertRequired: true, independentEditorRequired: true });
    expect(definition.publicStatusPolicy).toEqual({ gate_failed: "insufficient_data" });
  });
});

describe("canonical JSON and sha256", () => {
  it("is stable regardless of object key order", () => {
    const a = { b: 1, a: { y: [1, { q: true, p: null }], x: "s" } };
    const b = { a: { x: "s", y: [1, { p: null, q: true }] }, b: 1 };
    expect(canonicalJsonStringify(a)).toBe(canonicalJsonStringify(b));
    expect(computeDefinitionSha256(a)).toBe(computeDefinitionSha256(b));
    expect(computeDefinitionSha256(a)).toMatch(/^[0-9a-f]{64}$/);
  });

  it("is sensitive to array order and values", () => {
    expect(computeDefinitionSha256({ a: [1, 2] })).not.toBe(computeDefinitionSha256({ a: [2, 1] }));
    expect(computeDefinitionSha256({ a: 1 })).not.toBe(computeDefinitionSha256({ a: 2 }));
  });

  it("gives the same hash for the definition with reversed key order", () => {
    const reversed = Object.fromEntries(Object.entries(definition).reverse());
    expect(computeDefinitionSha256(reversed)).toBe(computeDefinitionSha256(definition));
  });

  it("rejects non-JSON values", () => {
    expect(() => canonicalJsonStringify({ a: Number.NaN })).toThrow(/non-finite/);
    expect(() => canonicalJsonStringify({ a: undefined })).toThrow(/undefined/);
  });
});

describe("planSpotMethodologyAction", () => {
  const sha = "a".repeat(64);
  const other = "b".repeat(64);

  it("creates a missing row", () => {
    expect(planSpotMethodologyAction(null, sha)).toEqual({ action: "create" });
  });

  it("updates a draft with a different definition", () => {
    expect(planSpotMethodologyAction({ status: "draft", definitionSha256: other, pinnedAudits: 0 }, sha)).toEqual({
      action: "update",
      previousSha256: other,
    });
  });

  it("is a no-op when the definition is unchanged", () => {
    for (const status of ["draft", "approved", "retired"]) {
      expect(planSpotMethodologyAction({ status, definitionSha256: sha, pinnedAudits: 3 }, sha)).toEqual({
        action: "noop",
        status,
      });
    }
  });

  it("refuses to change a draft that already has pinned assessments", () => {
    const plan = planSpotMethodologyAction({ status: "draft", definitionSha256: other, pinnedAudits: 2 }, sha);
    expect(plan).toMatchObject({ action: "blocked_pinned_audits", status: "draft", existingSha256: other, pinnedAudits: 2 });
    if (plan.action === "blocked_pinned_audits") expect(plan.message).toMatch(/2 assessment\(s\) are pinned/);
  });

  it("refuses to change approved or retired definitions", () => {
    for (const status of ["approved", "retired"]) {
      const plan = planSpotMethodologyAction({ status, definitionSha256: other, pinnedAudits: 0 }, sha);
      expect(plan.action).toBe("error");
      if (plan.action === "error") expect(plan.message).toMatch(/immutable/);
    }
  });
});

describe("parseSpotMethodologyDefinition", () => {
  it("rejects incomplete definitions", () => {
    expect(() => parseSpotMethodologyDefinition([])).toThrow();
    expect(() => parseSpotMethodologyDefinition({ ...definition, ratingVersion: "" })).toThrow(/ratingVersion/);
    expect(() => parseSpotMethodologyDefinition({ ...definition, validityMonths: 0 })).toThrow(/validityMonths/);
    expect(() => parseSpotMethodologyDefinition({ ...definition, gates: [] })).toThrow(/gates/);
  });
});
