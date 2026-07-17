import { describe, expect, it } from "vitest";
import { requiredConsentsForProgram } from "./consentTexts";

describe("requiredConsentsForProgram", () => {
  it("requires base consents for low risk", () => {
    const r = requiredConsentsForProgram("low", false);
    expect(r).toContain("pd_processing");
    expect(r).toContain("contact_transfer");
    expect(r).toContain("not_organizer");
    expect(r).not.toContain("high_risk");
    expect(r).not.toContain("kids_parent");
  });

  it("adds high_risk for extreme", () => {
    const r = requiredConsentsForProgram("extreme", false);
    expect(r).toContain("high_risk");
  });

  it("adds kids_parent for kids programs", () => {
    const r = requiredConsentsForProgram("low", true);
    expect(r).toContain("kids_parent");
  });
});
