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

function candidateV2(overrides: Record<string, unknown> = {}) {
  return {
    scoutArea: "sheregesh",
    region: "Кемеровская область — Кузбасс",
    name: "Sheregesh Freeride School",
    organizerName: "ООО Шерегеш Фрирайд",
    url: "https://sheregesh-school.ru/",
    organizerKinds: ["school", "guide_team"],
    kind: "школа фрирайда / гиды",
    disciplines: ["freeride", "ski-tour"],
    rawDisciplines: ["фрирайд", "скитур"],
    formats: ["course"],
    legal: { registry: null, inn: "4205000000" },
    osintScore: 4,
    evidence: ["https://sheregesh-school.ru/about"],
    ...overrides,
  };
}

/** n distinct valid v2 candidates in one zone. */
function zone(n: number, overrides: Record<string, unknown> = {}): Record<string, unknown>[] {
  return Array.from({ length: n }, (_, i) =>
    candidateV2({ url: `https://school-${i + 1}.ru/`, evidence: [`https://school-${i + 1}.ru/about`], ...overrides }),
  );
}

function v2Wrapper(candidates: unknown[] = [candidateV2()]) {
  return { schemaVersion: 2, batchId: "wave2-2026-10-05", wave: 2, discoveredAt: "2026-10-05", candidates };
}

function batchV2(candidates: unknown[]): ScoutBatch {
  return { batchId: "wave2-2026-10-05", schemaVersion: 2, wave: 2, discoveredAt: "2026-10-05", candidates: candidates as ScoutBatch["candidates"] };
}

function warningCodes(result: ReturnType<typeof validateScoutBatch>) {
  return result.warnings.map((issue) => issue.code);
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
    expect(() => parseScoutBatch({ schemaVersion: 3, batchId: "x", candidates: [] }, "f.json")).toThrow(/schemaVersion/);
    expect(() => parseScoutBatch({ schemaVersion: 1, candidates: [] }, "f.json")).toThrow(/batchId/);
    expect(() => parseScoutBatch({ schemaVersion: 2, wave: 2, discoveredAt: "2026-10-05", candidates: [] }, "f.json")).toThrow(/batchId/);
    expect(() => parseScoutBatch("nope", "f.json")).toThrow();
  });

  it("parses the v2 wrapper with batchId, wave and discoveredAt", () => {
    const parsed = parseScoutBatch(
      { schemaVersion: 2, batchId: " wave2-sheregesh ", wave: 2, discoveredAt: "2026-10-05", candidates: [candidateV2()] },
      "source_proposals_osint_wave2.json",
    );
    expect(parsed).toMatchObject({ schemaVersion: 2, batchId: "wave2-sheregesh", wave: 2, discoveredAt: "2026-10-05" });
    expect(parsed.candidates).toHaveLength(1);
    expect(parseScoutBatch({ ...v2Wrapper(), discoveredAt: "2026-10-05T09:30:00Z" }, "f.json").discoveredAt).toBe("2026-10-05T09:30:00Z");
  });

  it("does not attach wave/discoveredAt to v1 wrappers", () => {
    const parsed = parseScoutBatch({ schemaVersion: 1, batchId: "b", wave: 2, discoveredAt: "2026-10-05", candidates: [] }, "f.json");
    expect(parsed).not.toHaveProperty("wave");
    expect(parsed).not.toHaveProperty("discoveredAt");
  });

  it.each([
    [{ wave: undefined }, /wave/],
    [{ wave: 0 }, /wave/],
    [{ wave: 2.5 }, /wave/],
    [{ wave: "2" }, /wave/],
    [{ discoveredAt: undefined }, /discoveredAt/],
    [{ discoveredAt: "05.10.2026" }, /discoveredAt/],
    [{ discoveredAt: "2026-13-45" }, /discoveredAt/],
    [{ candidates: "x" }, /candidates/],
  ])("rejects v2 wrapper %o", (overrides, pattern) => {
    expect(() => parseScoutBatch({ ...v2Wrapper(), ...overrides }, "f.json")).toThrow(pattern);
  });
});

describe("validateScoutBatch", () => {
  it("accepts a valid candidate and computes stats", () => {
    const result = validateScoutBatch(batch([candidate(), candidate({ url: "https://t.me/test_school", kind: "клуб" })]));
    expect(result.errors).toEqual([]);
    expect(result.rows).toHaveLength(2);
    expect(result.rows[1]).toMatchObject({ detectedType: "telegram", normalizedUrl: "https://t.me/test_school" });
    expect(result.stats).toEqual({
      byRegion: { "Алтай": 2 },
      byKind: { "школа": 1, "клуб": 1 },
      byScoutArea: { altai: 2 },
      byDiscipline: { freeride: 2 },
      byFormat: {},
    });
  });

  it("v1: taxonomy mismatches are warnings only, v2 fields are not enforced", () => {
    const result = validateScoutBatch(
      batch([
        candidate({
          region: "Атлантида",
          kind: "нечто",
          disciplines: ["рыбалка", "Kite / camp"],
          scoutArea: "nowhere",
          organizerKinds: ["bad"],
          osintScore: 3.5,
        }),
      ]),
    );
    expect(result.errors).toEqual([]);
    expect(warningCodes(result)).toEqual(["taxonomy_unknown_region", "taxonomy_unknown_kind", "taxonomy_unresolved_discipline"]);
    expect(result.warnings[2].message).toContain('"рыбалка"');
    expect(result.stats).toMatchObject({ byScoutArea: {}, byDiscipline: { kite: 1 }, byFormat: { camp: 1 } });
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
    expect(result.stats.byScoutArea).toEqual({ kamchatka: 10, altai: 10, elbrus: 10 });
    const allowed = new Set(["notes_truncated", "score_without_legal", "taxonomy_unresolved_discipline"]);
    expect(result.warnings.filter((issue) => !allowed.has(issue.code))).toEqual([]);
  });
});

describe("validateScoutBatch: schemaVersion 2", () => {
  function v2Result(overrides: Record<string, unknown>) {
    return validateScoutBatch(batchV2([candidateV2(overrides)]));
  }

  it("accepts a clean zone of 5 with no warnings and computes taxonomy stats", () => {
    const result = validateScoutBatch(batchV2(zone(5)));
    expect(result.errors).toEqual([]);
    expect(result.warnings).toEqual([]);
    expect(result.rows).toHaveLength(5);
    expect(result.stats).toEqual({
      byRegion: { "Кемеровская область — Кузбасс": 5 },
      byKind: { "школа фрирайда / гиды": 5 },
      byScoutArea: { sheregesh: 5 },
      byDiscipline: { freeride: 5, "ski-tour": 5 },
      byFormat: { course: 5 },
    });
  });

  it("optional fields may be omitted or null", () => {
    const result = v2Result({
      organizerName: undefined,
      rawDisciplines: undefined,
      formats: undefined,
      legal: undefined,
      keyPerson: null,
      role: null,
      seasonality: null,
      reputation: null,
      contacts: { phone: "+7 900 000-00-00", telegram: null },
      partners: ["Sheregesh Ski Patrol"],
    });
    expect(result.errors).toEqual([]);
  });

  it.each([
    [{ scoutArea: undefined }, "scout_area_required"],
    [{ scoutArea: "  " }, "scout_area_required"],
    [{ scoutArea: "altai" }, "scout_area_wrong_wave"],
    [{ scoutArea: "kamchatka" }, "scout_area_wrong_wave"],
    [{ scoutArea: "Шерегеш" }, "invalid_scout_area"],
    [{ scoutArea: "atlantis" }, "invalid_scout_area"],
    [{ region: "" }, "required_fields"],
    [{ name: undefined }, "required_fields"],
    [{ kind: "" }, "required_fields"],
    [{ organizerKinds: undefined }, "organizer_kinds_required"],
    [{ organizerKinds: [] }, "organizer_kinds_required"],
    [{ organizerKinds: ["школа"] }, "invalid_organizer_kind"],
    [{ organizerKinds: ["school", "operator"] }, "invalid_organizer_kind"],
    [{ disciplines: undefined }, "disciplines_required"],
    [{ disciplines: [] }, "disciplines_required"],
    [{ disciplines: ["фрирайд"] }, "invalid_discipline"],
    [{ disciplines: ["Freeride"] }, "invalid_discipline"],
    [{ disciplines: ["рыбалка"] }, "invalid_discipline"],
    [{ disciplines: [42] }, "invalid_discipline"],
    [{ formats: ["кэмп"] }, "invalid_format"],
    [{ formats: "course" }, "invalid_field_type"],
    [{ rawDisciplines: "фрирайд" }, "invalid_field_type"],
    [{ rawDisciplines: [1] }, "invalid_field_type"],
    [{ organizerName: 5 }, "invalid_field_type"],
    [{ keyPerson: ["Иван"] }, "invalid_field_type"],
    [{ partners: "a, b" }, "invalid_field_type"],
    [{ contacts: { phone: 79000000000 } }, "invalid_field_type"],
    [{ contacts: ["x"] }, "invalid_field_type"],
    [{ legal: "РТО 1" }, "invalid_field_type"],
    [{ legal: { inn: 4205000000 } }, "invalid_field_type"],
    [{ osintScore: 3.5 }, "invalid_osint_score"],
    [{ osintScore: 0 }, "invalid_osint_score"],
    [{ osintScore: 6 }, "invalid_osint_score"],
    [{ osintScore: "4" }, "invalid_osint_score"],
    [{ evidence: [] }, "evidence_required"],
    [{ evidence: ["http://10.0.0.1/x"] }, "invalid_evidence_url"],
    [{ url: "http://192.168.1.10/" }, "unsafe_source_url"],
  ])("rejects %o with %s", (overrides, code) => {
    const result = v2Result(overrides);
    expect(codes(result)).toContain(code);
    expect(result.rows).toHaveLength(0);
  });

  it.each([
    [{ scoutArea: "Шерегеш" }, '"sheregesh"'],
    [{ scoutArea: "Хибины" }, '"khibiny-kola"'],
    [{ disciplines: ["freeride", "скитур"] }, 'disciplines[1] "скитур" is not a canonical id; did you mean "ski-tour"?'],
    [{ disciplines: ["Freeride"] }, 'did you mean "freeride"?'],
    [{ organizerKinds: ["туроператор/горная школа"] }, 'did you mean "tour_operator", "school"?'],
    [{ formats: ["кэмп"] }, 'did you mean "camp"?'],
  ])("suggests the canonical id for alias %o", (overrides, fragment) => {
    expect(v2Result(overrides).errors[0].message).toContain(fragment);
  });

  it("gives no suggestion when the value does not resolve", () => {
    expect(v2Result({ disciplines: ["рыбалка"] }).errors[0].message).not.toContain("did you mean");
  });

  it("lists allowed wave 2 zones for a wave 1 zone", () => {
    const message = v2Result({ scoutArea: "elbrus" }).errors[0].message;
    expect(message).toContain("wave 1 zone");
    expect(message).toContain("sheregesh");
    expect(message).toContain("sakhalin-kurils");
  });

  it.each(FORBIDDEN_CANDIDATE_FIELDS)("still rejects forbidden field %s", (field) => {
    const result = v2Result({ [field]: false });
    expect(result.errors).toEqual([expect.objectContaining({ code: "forbidden_field", message: expect.stringContaining(field) })]);
  });

  it("still detects in-batch and cross-batch duplicates", () => {
    const inBatch = validateScoutBatch(batchV2([candidateV2(), candidateV2({ url: "https://sheregesh-school.ru" })]));
    expect(codes(inBatch)).toEqual(["duplicate_in_batch"]);

    const other = batch([candidate({ url: "https://sheregesh-school.ru/" })], "2026-09-29");
    const crossBatch = validateScoutBatch(batchV2([candidateV2()]), { otherBatchKeys: collectBatchKeys(other) });
    expect(codes(crossBatch)).toEqual(["duplicate_cross_batch"]);
  });

  it("warns on unresolved rawDisciplines, foreign region, unknown fields and score 5 without legal", () => {
    const rows = zone(5);
    rows[0] = { ...rows[0], rawDisciplines: ["фрирайд", "рыбалка"] };
    rows[1] = { ...rows[1], region: "Новосибирская область" };
    rows[2] = { ...rows[2], scoutarea: "typo" };
    rows[3] = { ...rows[3], osintScore: 5, legal: { registry: null, inn: null } };
    rows[4] = { ...rows[4], osintScore: 5, legal: { registry: "РТО 000002" } };
    const result = validateScoutBatch(batchV2(rows));
    expect(result.errors).toEqual([]);
    expect(result.warnings.map((issue) => [issue.row, issue.code])).toEqual([
      [1, "unresolved_raw_discipline"],
      [2, "region_not_area_subject"],
      [3, "unknown_field"],
      [4, "score_without_legal"],
    ]);
    expect(result.warnings[0].message).toContain('"рыбалка"');
    expect(result.warnings[1].message).toContain("Кемеровская область — Кузбасс");
    expect(result.warnings[2].message).toContain('"scoutarea"');
  });

  it("accepts any listed subject of the zone as region (case/ё-insensitive)", () => {
    const rows = zone(5, { scoutArea: "baikal", region: "республика бурятия" });
    expect(validateScoutBatch(batchV2(rows)).warnings).toEqual([]);
  });

  it.each([
    [4, "scout_area_underfilled"],
    [13, "scout_area_overfilled"],
  ])("warns when a zone has %i candidates", (n, code) => {
    const result = validateScoutBatch(batchV2(zone(n)));
    expect(result.errors).toEqual([]);
    expect(result.warnings).toEqual([expect.objectContaining({ row: null, code, message: expect.stringContaining("zone sheregesh") })]);
  });

  it.each([5, 10, 12])("does not warn for %i candidates in a zone", (n) => {
    expect(validateScoutBatch(batchV2(zone(n))).warnings).toEqual([]);
  });

  it("counts zones independently", () => {
    const karelia = zone(3, { scoutArea: "karelia", region: "Республика Карелия" }).map((c, i) => ({
      ...c,
      url: `https://karelia-${i}.ru/`,
      evidence: [`https://karelia-${i}.ru/a`],
    }));
    const result = validateScoutBatch(batchV2([...zone(5), ...karelia]));
    expect(result.stats.byScoutArea).toEqual({ sheregesh: 5, karelia: 3 });
    expect(warningCodes(result)).toEqual(["scout_area_underfilled"]);
    expect(result.warnings[0].message).toContain("zone karelia");
  });

  it("zone counts only include valid rows", () => {
    const rows = zone(5);
    rows[0] = { ...rows[0], disciplines: ["фрирайд"] };
    const result = validateScoutBatch(batchV2(rows));
    expect(result.stats.byScoutArea).toEqual({ sheregesh: 4 });
    expect(warningCodes(result)).toEqual(["scout_area_underfilled"]);
  });

  it("parses and validates a full v2 file end-to-end", () => {
    const parsed = parseScoutBatch(v2Wrapper(zone(10)), "source_proposals_osint_wave2-2026-10-05.json");
    const result = validateScoutBatch(parsed);
    expect(result.errors).toEqual([]);
    expect(result.warnings).toEqual([]);
    expect(result.stats.byScoutArea).toEqual({ sheregesh: 10 });
  });
});
