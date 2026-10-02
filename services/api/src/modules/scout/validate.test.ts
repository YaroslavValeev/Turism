import { fileURLToPath } from "url";
import { describe, expect, it, vi } from "vitest";

vi.mock("../../lib/prisma", () => {
  throw new Error("validate.ts must stay prisma-free");
});

import { loadScoutBatch, parseScoutBatch, type ScoutBatch } from "./candidate";
import { FORBIDDEN_CANDIDATE_FIELDS, collectBatchKeys, isPublicHttpUrl, validateScoutBatch } from "./validate";

const WAVE1_PATH = new URL("../../../prisma/source_proposals_osint_2026-09-29.json", import.meta.url);

function candidate(overrides: Record<string, unknown> = {}) {
  return {
    region: "Алтай",
    name: "Test School",
    organizerName: "ООО Тест",
    url: "https://test-school.ru/",
    kind: "школа",
    disciplines: ["фрирайд"],
    legal: { registry: "РТО 000001", inn: null },
    osintScore: 4,
    evidence: ["https://test-school.ru/about"],
    ...overrides,
  };
}

function batch(candidates: unknown[], batchId = "2026-10-01"): ScoutBatch {
  return { batchId, schemaVersion: 1, candidates: candidates as ScoutBatch["candidates"] };
}

function codes(result: ReturnType<typeof validateScoutBatch>) {
  return result.errors.map((issue) => issue.code);
}

describe("parseScoutBatch", () => {
  it("derives batchId from a legacy array file name", () => {
    const parsed = parseScoutBatch([candidate()], "source_proposals_osint_2026-09-29.json");
    expect(parsed).toMatchObject({ batchId: "2026-09-29", schemaVersion: 1 });
    expect(parsed.candidates).toHaveLength(1);
  });

  it("accepts the wrapper format", () => {
    const parsed = parseScoutBatch(
      { schemaVersion: 1, batchId: "wave2-2026-10-05", candidates: [candidate()] },
      "anything.json",
    );
    expect(parsed.batchId).toBe("wave2-2026-10-05");
  });

  it("rejects unknown schemaVersion and missing batchId", () => {
    expect(() => parseScoutBatch({ schemaVersion: 2, batchId: "x", candidates: [] }, "f.json")).toThrow(/schemaVersion/);
    expect(() => parseScoutBatch({ schemaVersion: 1, candidates: [] }, "f.json")).toThrow(/batchId/);
    expect(() => parseScoutBatch("nope", "f.json")).toThrow();
  });
});

describe("validateScoutBatch", () => {
  it("accepts a valid candidate and computes stats", () => {
    const result = validateScoutBatch(batch([candidate(), candidate({ url: "https://t.me/test_school", kind: "клуб" })]));
    expect(result.errors).toEqual([]);
    expect(result.rows).toHaveLength(2);
    expect(result.rows[1]).toMatchObject({ detectedType: "telegram", normalizedUrl: "https://t.me/test_school" });
    expect(result.stats).toEqual({ byRegion: { "Алтай": 2 }, byKind: { "школа": 1, "клуб": 1 } });
  });

  it.each([
    [{ region: "" }, "required_fields"],
    [{ name: "  " }, "required_fields"],
    [{ kind: undefined }, "required_fields"],
    [{ disciplines: [] }, "disciplines_required"],
    [{ evidence: [] }, "evidence_required"],
    [{ osintScore: 0 }, "invalid_osint_score"],
    [{ osintScore: 6 }, "invalid_osint_score"],
    [{ osintScore: "5" }, "invalid_osint_score"],
    [{ url: "ftp://example.com/" }, "invalid_source_url"],
    [{ url: "https://www.instagram.com/p/ABC/" }, "invalid_source_url"],
    [{ url: "http://192.168.1.10/" }, "unsafe_source_url"],
  ])("rejects %o with %s", (overrides, code) => {
    const result = validateScoutBatch(batch([candidate(overrides)]));
    expect(codes(result)).toContain(code);
    expect(result.rows).toHaveLength(0);
  });

  it.each(FORBIDDEN_CANDIDATE_FIELDS)("rejects forbidden field %s", (field) => {
    const result = validateScoutBatch(batch([candidate({ [field]: false })]));
    expect(result.errors).toEqual([expect.objectContaining({ row: 1, code: "forbidden_field", message: expect.stringContaining(field) })]);
  });

  it.each([
    "http://localhost/x",
    "http://intranet.local/x",
    "http://10.0.0.5/x",
    "http://172.20.1.1/x",
    "http://192.168.0.1/x",
    "http://127.0.0.1/x",
    "http://169.254.169.254/latest/meta-data",
    "http://[::1]/x",
    "http://[fd00::1]/x",
    "javascript:alert(1)",
    "file:///etc/passwd",
    "not a url",
  ])("rejects non-public evidence URL %s", (url) => {
    const result = validateScoutBatch(batch([candidate({ evidence: ["https://ok.ru/a", url] })]));
    expect(codes(result)).toEqual(["invalid_evidence_url"]);
    expect(isPublicHttpUrl(url)).toBe(false);
  });

  it("collects all errors across rows instead of stopping at the first", () => {
    const result = validateScoutBatch(
      batch([
        candidate({ region: "", osintScore: 9, verified: true }),
        candidate({ url: "https://second.ru/" }),
        candidate({ url: "https://third.ru/", evidence: [] }),
      ]),
    );
    expect(result.errors.map((issue) => [issue.row, issue.code])).toEqual([
      [1, "forbidden_field"],
      [1, "required_fields"],
      [1, "invalid_osint_score"],
      [3, "evidence_required"],
    ]);
    expect(result.rows.map((row) => row.row)).toEqual([2]);
  });

  it("detects in-batch duplicates after normalization", () => {
    const result = validateScoutBatch(
      batch([candidate({ url: "https://t.me/s/RusKiteNews/460" }), candidate({ url: "https://t.me/RusKiteNews" })]),
    );
    expect(result.errors).toEqual([
      expect.objectContaining({ row: 2, code: "duplicate_in_batch", message: expect.stringContaining("row 1") }),
    ]);
  });

  it("detects cross-batch duplicates", () => {
    const other = batch([candidate({ url: "https://test-school.ru" })], "2026-09-29");
    const result = validateScoutBatch(batch([candidate()]), { otherBatchKeys: collectBatchKeys(other) });
    expect(codes(result)).toEqual(["duplicate_cross_batch"]);
  });

  it("reports an empty batch", () => {
    expect(codes(validateScoutBatch(batch([])))).toEqual(["empty_batch"]);
  });

  it("warns on notes truncation and on score 5 without registry/inn", () => {
    const longEvidence = Array.from({ length: 40 }, (_, i) => `https://evidence.ru/${"x".repeat(40)}/${i}`);
    const result = validateScoutBatch(
      batch([
        candidate({ evidence: longEvidence }),
        candidate({ url: "https://five.ru/", osintScore: 5, legal: { registry: null, inn: null } }),
        candidate({ url: "https://five-ok.ru/", osintScore: 5, legal: { inn: "4101109668" } }),
      ]),
    );
    expect(result.errors).toEqual([]);
    expect(result.warnings.map((issue) => [issue.row, issue.code])).toEqual([
      [1, "notes_truncated"],
      [2, "score_without_legal"],
    ]);
  });

  it("validates the Wave 1 file with zero errors", async () => {
    const wave1 = await loadScoutBatch(fileURLToPath(WAVE1_PATH));
    expect(wave1.batchId).toBe("2026-09-29");
    const result = validateScoutBatch(wave1, { otherBatchKeys: new Set() });
    expect(result.errors).toEqual([]);
    expect(result.rows).toHaveLength(30);
    expect(result.stats.byRegion).toEqual({ "Камчатка": 10, "Алтай": 10, "Приэльбрусье": 10 });
  });
});
