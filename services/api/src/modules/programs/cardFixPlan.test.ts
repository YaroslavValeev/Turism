import { describe, expect, it } from "vitest";
import { CARD_FIX_FIELDS, cardFixAuditReason, planCardFix, type CardFixSpec, type ProgramFixSnapshot } from "./cardFixPlan";
import { catalogDate, PROGRAM_CARD_FIX_TAG, PROGRAM_CARD_FIXES_2026_10 } from "./programCardFixes202610";

const spec: CardFixSpec = {
  programId: "p1",
  label: "Ски-тур на Мамае",
  expect: { sourceUrl: "https://a/kids", startDate: catalogDate("2026-11-16"), region: "Russia", exactLocation: null },
  set: { sourceUrl: "https://a/mamay", startDate: catalogDate("2026-11-29"), region: "Иркутская область" },
  evidence: ["https://a/mamay"],
  note: "test",
};

function snapshot(overrides: Partial<ProgramFixSnapshot> = {}): ProgramFixSnapshot {
  return {
    id: "p1",
    manualFields: [],
    sourceUrl: "https://a/kids",
    startDate: new Date("2026-11-16T12:00:00.000Z"),
    region: "Russia",
    exactLocation: null,
    ...overrides,
  };
}

function applyOutcome(program: ProgramFixSnapshot, outcome: ReturnType<typeof planCardFix>): ProgramFixSnapshot {
  if (outcome.status !== "update") return program;
  return { ...program, ...outcome.data, manualFields: outcome.data.manualFields ?? program.manualFields };
}

describe("planCardFix", () => {
  it("plans field changes and locks them in manualFields", () => {
    const outcome = planCardFix(spec, snapshot({ manualFields: ["title"] }));
    expect(outcome.status).toBe("update");
    if (outcome.status !== "update") return;
    expect(outcome.changes.map((c) => c.field)).toEqual(["sourceUrl", "startDate", "region"]);
    expect(outcome.data.startDate).toEqual(new Date("2026-11-29T12:00:00.000Z"));
    expect(outcome.manualFieldsAfter).toEqual(["region", "sourceUrl", "startDate", "title"]);
    expect(outcome.data).not.toHaveProperty("publishStatus");
  });

  it("dedupes manualFields that are already locked", () => {
    const outcome = planCardFix(spec, snapshot({ manualFields: ["sourceUrl", "region"] }));
    if (outcome.status !== "update") throw new Error(outcome.status);
    expect(outcome.manualFieldsAfter).toEqual(["region", "sourceUrl", "startDate"]);
  });

  it("skips the row when a current DB value differs from expected", () => {
    const outcome = planCardFix(spec, snapshot({ sourceUrl: "https://a/other" }));
    expect(outcome).toEqual({
      status: "guard_mismatch",
      programId: "p1",
      mismatches: [{ field: "sourceUrl", expected: "https://a/kids", actual: "https://a/other" }],
    });
  });

  it("guards expect-only fields too", () => {
    const outcome = planCardFix(spec, snapshot({ exactLocation: "Шерегеш" }));
    expect(outcome.status).toBe("guard_mismatch");
  });

  it("accepts a field an admin already set to the target value", () => {
    const outcome = planCardFix(spec, snapshot({ region: "Иркутская область" }));
    if (outcome.status !== "update") throw new Error(outcome.status);
    expect(outcome.changes.map((c) => c.field)).toEqual(["sourceUrl", "startDate"]);
  });

  it("is idempotent: second run after apply is a noop", () => {
    const first = planCardFix(spec, snapshot());
    const after = applyOutcome(snapshot(), first);
    expect(planCardFix(spec, after)).toEqual({ status: "noop", programId: "p1" });
  });

  it("only locks manualFields when values already match", () => {
    const outcome = planCardFix(spec, snapshot({ sourceUrl: "https://a/mamay", startDate: catalogDate("2026-11-29"), region: "Иркутская область" }));
    if (outcome.status !== "update") throw new Error(outcome.status);
    expect(outcome.changes).toEqual([]);
    expect(outcome.data).toEqual({ manualFields: ["region", "sourceUrl", "startDate"] });
  });

  it("reports missing programs", () => {
    expect(planCardFix(spec, null)).toEqual({ status: "missing", programId: "p1" });
  });

  it("builds the audit reason with the tag", () => {
    expect(cardFixAuditReason(PROGRAM_CARD_FIX_TAG, spec)).toBe("data-fix 2026-10: test");
  });
});

describe("PROGRAM_CARD_FIXES_2026_10", () => {
  const allowed = new Set<string>(CARD_FIX_FIELDS);
  const dayMs = 24 * 60 * 60 * 1000;

  it("has unique program ids and only whitelisted fields", () => {
    const ids = PROGRAM_CARD_FIXES_2026_10.map((s) => s.programId);
    expect(new Set(ids).size).toBe(ids.length);
    for (const s of PROGRAM_CARD_FIXES_2026_10) {
      for (const field of [...Object.keys(s.expect), ...Object.keys(s.set)]) expect(allowed.has(field)).toBe(true);
      expect(s.evidence.length).toBeGreaterThan(0);
    }
  });

  it("guards every field it changes", () => {
    for (const s of PROGRAM_CARD_FIXES_2026_10) {
      for (const field of Object.keys(s.set)) expect(Object.keys(s.expect)).toContain(field);
    }
  });

  it("keeps dates at noon UTC and durationDays consistent", () => {
    for (const s of PROGRAM_CARD_FIXES_2026_10) {
      const start = (s.set.startDate ?? s.expect.startDate) as Date;
      const end = (s.set.endDate ?? s.expect.endDate) as Date;
      expect(start.getUTCHours()).toBe(12);
      expect(end.getUTCHours()).toBe(12);
      expect(end.getTime()).toBeGreaterThanOrEqual(start.getTime());
      if (s.set.durationDays != null) expect(s.set.durationDays).toBe(Math.round((end.getTime() - start.getTime()) / dayMs) + 1);
    }
  });

  it("applies cleanly to the expected production snapshot and is idempotent", () => {
    for (const s of PROGRAM_CARD_FIXES_2026_10) {
      const prod: ProgramFixSnapshot = { id: s.programId, manualFields: [], ...s.expect };
      const first = planCardFix(s, prod);
      expect(first.status).toBe("update");
      expect(planCardFix(s, applyOutcome(prod, first)).status).toBe("noop");
    }
  });
});
