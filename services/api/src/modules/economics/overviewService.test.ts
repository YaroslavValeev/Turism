import { describe, it, expect } from "vitest";
import { parseEconomicsDateRange } from "./overviewService";

describe("parseEconomicsDateRange", () => {
  it("rejects date_from > date_to", () => {
    const r = parseEconomicsDateRange({
      date_from: "2026-01-10",
      date_to: "2026-01-01",
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("date_from");
  });

  it("parses programId and organizerId", () => {
    const r = parseEconomicsDateRange({
      date_from: "2026-01-01",
      date_to: "2026-01-31",
      programId: " p1 ",
      organizerId: "o1",
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.programId).toBe("p1");
      expect(r.value.organizerId).toBe("o1");
    }
  });
});
