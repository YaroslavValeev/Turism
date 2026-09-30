import { describe, expect, it } from "vitest";
import {
  canTransitionAudit,
  parseAuditInput,
  parseCategoryScores,
  parseEvidenceCriterion,
  parseGateResults,
  parseSpotInput,
  parseUnitInput,
} from "./validation";

describe("parseSpotInput", () => {
  it("requires name and region on create and trims them", () => {
    expect(parseSpotInput({ region: "Moscow" }, "create")).toEqual({ ok: false, error: "name is required" });
    const ok = parseSpotInput({ name: "  Wake Park ", region: "Moscow", latitude: "55.7512345678", longitude: 37.6 }, "create");
    expect(ok).toEqual({ ok: true, data: { name: "Wake Park", region: "Moscow", latitude: 55.751235, longitude: 37.6 } });
  });

  it("rejects out-of-range or half-set coordinates", () => {
    expect(parseSpotInput({ name: "a", region: "b", latitude: 91, longitude: 0 }, "create").ok).toBe(false);
    expect(parseSpotInput({ name: "a", region: "b", latitude: 55 }, "create")).toEqual({
      ok: false,
      error: "latitude and longitude must be set together",
    });
    expect(parseSpotInput({ latitude: 55 }, "patch").ok).toBe(false);
  });

  it("validates enums and rejects empty patches", () => {
    expect(parseSpotInput({ waterBodyType: "ocean" }, "patch").ok).toBe(false);
    expect(parseSpotInput({ discoveryStatus: "listed" }, "patch")).toEqual({ ok: true, data: { discoveryStatus: "listed" } });
    expect(parseSpotInput({}, "patch")).toEqual({ ok: false, error: "nothing to update" });
  });
});

describe("parseUnitInput", () => {
  it("requires serviceName and an equipment config object on create", () => {
    expect(parseUnitInput({ serviceName: "Wakesurf" }, "create").ok).toBe(false);
    expect(parseUnitInput({ serviceName: "Wakesurf", equipmentConfig: { boat: "Supra SE" } }, "create")).toEqual({
      ok: true,
      data: { serviceName: "Wakesurf", equipmentConfig: { boat: "Supra SE" } },
    });
    expect(parseUnitInput({ discipline: "kite" }, "patch").ok).toBe(false);
  });
});

describe("parseAuditInput", () => {
  it("requires testedAt and all versions on create", () => {
    expect(parseAuditInput({ methodologyVersion: "v1.1" }, "create")).toEqual({ ok: false, error: "testedAt is required" });
    const ok = parseAuditInput(
      { testedAt: "2026-06-01T10:00:00Z", methodologyVersion: "v1.1", protocolVersion: "p", criteriaVersion: "c" },
      "create",
    );
    expect(ok.ok).toBe(true);
    expect(parseAuditInput({ testedAt: "not a date", methodologyVersion: "v", protocolVersion: "p", criteriaVersion: "c" }, "create").ok).toBe(false);
  });
});

describe("parseCategoryScores", () => {
  it("accepts known categories on a 0–10 scale with one decimal", () => {
    expect(parseCategoryScores({ scores: { safety: 7.5, instrument: 10 } })).toEqual({
      ok: true,
      data: { safety: 7.5, instrument: 10 },
    });
  });

  it("rejects unknown categories, out-of-range and over-precise values", () => {
    expect(parseCategoryScores({ scores: { price: 5 } }).ok).toBe(false);
    expect(parseCategoryScores({ scores: { safety: 11 } }).ok).toBe(false);
    expect(parseCategoryScores({ scores: { safety: 7.55 } }).ok).toBe(false);
    expect(parseCategoryScores({ scores: { safety: "7" } }).ok).toBe(false);
    expect(parseCategoryScores({ scores: {} }).ok).toBe(false);
  });
});

describe("parseGateResults", () => {
  it("accepts G01–G08 with pass/fail/unknown only", () => {
    expect(parseGateResults({ gates: { G01: "pass", G05: "unknown" } }).ok).toBe(true);
    expect(parseGateResults({ gates: { G09: "pass" } }).ok).toBe(false);
    expect(parseGateResults({ gates: { G01: "ok" } }).ok).toBe(false);
  });
});

describe("parseEvidenceCriterion", () => {
  it("allows a category, a gate or nothing", () => {
    expect(parseEvidenceCriterion("safety")).toEqual({ ok: true, data: "safety" });
    expect(parseEvidenceCriterion("G05")).toEqual({ ok: true, data: "G05" });
    expect(parseEvidenceCriterion(undefined)).toEqual({ ok: true, data: null });
    expect(parseEvidenceCriterion("price").ok).toBe(false);
  });
});

describe("canTransitionAudit", () => {
  it("follows draft → submitted → signed, with reopen and void", () => {
    expect(canTransitionAudit("draft", "submitted")).toBe(true);
    expect(canTransitionAudit("draft", "signed")).toBe(false);
    expect(canTransitionAudit("submitted", "signed")).toBe(true);
    expect(canTransitionAudit("submitted", "draft")).toBe(true);
    expect(canTransitionAudit("signed", "draft")).toBe(false);
    expect(canTransitionAudit("signed", "void")).toBe(true);
    expect(canTransitionAudit("void", "draft")).toBe(false);
  });
});
