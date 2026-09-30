import { describe, expect, it } from "vitest";
import { CANDIDATE_IMPORT_MAX_ITEMS, planCandidateImport, spotDedupKey } from "./candidateImport";

describe("spotDedupKey", () => {
  it("ignores case, ё, quotes and extra spaces", () => {
    expect(spotDedupKey("  «Ёлки»   Wake ", "Тверская  область")).toBe(spotDedupKey("елки wake", "тверская область"));
    expect(spotDedupKey("A", "Moscow")).not.toBe(spotDedupKey("A", "Tver"));
  });
});

describe("planCandidateImport", () => {
  it("rejects malformed batches", () => {
    expect(planCandidateImport({}, []).ok).toBe(false);
    expect(planCandidateImport({ items: [] }, []).ok).toBe(false);
    const tooMany = Array.from({ length: CANDIDATE_IMPORT_MAX_ITEMS + 1 }, (_, i) => ({ name: `s${i}`, region: "r" }));
    expect(planCandidateImport({ items: tooMany }, []).ok).toBe(false);
  });

  it("forces candidate status and reports row errors by index", () => {
    const res = planCandidateImport(
      { items: [{ name: "A", region: "R", discoveryStatus: "listed" }, { name: "B", region: "R", latitude: 55 }, "x"] },
      [],
    );
    if (!res.ok) throw new Error(res.error);
    expect(res.data.toCreate).toHaveLength(1);
    expect(res.data.toCreate[0].data.discoveryStatus).toBe("candidate");
    expect(res.data.errors.map((e) => e.index)).toEqual([1, 2]);
    expect(res.data.errors[0].name).toBe("B");
  });
});
