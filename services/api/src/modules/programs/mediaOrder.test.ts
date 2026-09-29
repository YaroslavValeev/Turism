import { describe, expect, it } from "vitest";
import { nextMediaPosition, validateMediaReorder } from "./mediaOrder";

describe("nextMediaPosition", () => {
  it("starts gallery at 0", () => {
    expect(nextMediaPosition([])).toBe(0);
  });

  it("appends after the highest position, even with gaps", () => {
    expect(nextMediaPosition([{ position: 0 }, { position: 4 }, { position: 2 }])).toBe(5);
  });
});

describe("validateMediaReorder", () => {
  const existing = ["a", "b", "c"];

  it("accepts a full permutation", () => {
    expect(validateMediaReorder({ mediaIds: ["c", "a", "b"] }, existing)).toEqual({ ok: true, order: ["c", "a", "b"] });
  });

  it.each([
    [null],
    [{}],
    [{ mediaIds: "a,b,c" }],
    [{ mediaIds: ["a", "b"] }],
    [{ mediaIds: ["a", "b", "c", "d"] }],
    [{ mediaIds: ["a", "a", "b"] }],
    [{ mediaIds: ["a", "b", "x"] }],
    [{ mediaIds: ["a", "b", 3] }],
  ])("rejects %j", (body) => {
    expect(validateMediaReorder(body, existing).ok).toBe(false);
  });
});
