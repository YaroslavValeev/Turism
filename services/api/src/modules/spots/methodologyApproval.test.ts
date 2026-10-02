import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { planSpotMethodologyApproval } from "./methodologyApproval";
import { computeDefinitionSha256 } from "./methodologyRegistry";
import type { PinnableMethodology } from "./methodologyPin";

const definition = JSON.parse(
  readFileSync(path.resolve(__dirname, "../../../prisma/data/spot-methodology/wakesurf-v1.1.json"), "utf8"),
) as Record<string, unknown>;
const SHA = computeDefinitionSha256(definition);

function row(overrides: Partial<PinnableMethodology> = {}): PinnableMethodology {
  return {
    id: "spotmeth_wakesurf_v1_1",
    discipline: "wakesurf",
    methodologyVersion: "v1.1",
    protocolVersion: "wakesurf-v1.1",
    criteriaVersion: "wakesurf-v1.1",
    ratingVersion: "wakesurf-v1.1",
    status: "draft",
    definition,
    definitionSha256: SHA,
    ...overrides,
  };
}

describe("planSpotMethodologyApproval", () => {
  it("approves the shipped wakesurf v1.1 draft when the owner confirms its sha256", () => {
    expect(planSpotMethodologyApproval(row(), SHA)).toEqual({ ok: true, definitionSha256: SHA });
    expect(planSpotMethodologyApproval(row(), ` ${SHA.toUpperCase()} `)).toEqual({ ok: true, definitionSha256: SHA });
  });

  it("requires the expected sha256 of the version being approved", () => {
    for (const value of [undefined, "", "abc", 42]) {
      expect(planSpotMethodologyApproval(row(), value)).toMatchObject({ ok: false, status: 400, code: "expected_sha256_required" });
    }
  });

  it("approves only drafts", () => {
    for (const status of ["approved", "retired"]) {
      expect(planSpotMethodologyApproval(row({ status }), SHA)).toMatchObject({ ok: false, status: 409, code: "methodology_not_draft" });
    }
  });

  it("refuses a different version than the one the owner confirmed", () => {
    expect(planSpotMethodologyApproval(row(), "f".repeat(64))).toMatchObject({
      ok: false,
      status: 409,
      code: "methodology_sha256_mismatch",
    });
  });

  it("refuses when the stored definition no longer matches its sha256 or version columns", () => {
    const tampered = { ...definition, validityMonths: 24 };
    expect(planSpotMethodologyApproval(row({ definition: tampered }), SHA)).toMatchObject({ code: "methodology_integrity_failed" });
    expect(planSpotMethodologyApproval(row({ ratingVersion: "wakesurf-v2" }), SHA)).toMatchObject({ code: "methodology_integrity_failed" });
  });

  it("refuses a consistent definition that the rating engine cannot compute", () => {
    const foreign = { ...definition, validityMonths: 24 };
    const foreignSha = computeDefinitionSha256(foreign);
    expect(planSpotMethodologyApproval(row({ definition: foreign, definitionSha256: foreignSha }), foreignSha)).toMatchObject({
      ok: false,
      status: 409,
      code: "methodology_engine_mismatch",
    });
  });
});
