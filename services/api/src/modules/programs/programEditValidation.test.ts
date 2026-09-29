import { describe, expect, it } from "vitest";
import { validateProgramCardPatch, validateProgramMediaInput } from "./programEditValidation";

const current = { startDate: new Date("2026-10-10"), endDate: new Date("2026-10-15") };

describe("validateProgramCardPatch", () => {
  it("accepts a normal text/date edit", () => {
    expect(
      validateProgramCardPatch(
        { title: "Wake camp", startDate: "2026-10-11", endDate: "2026-10-14", durationDays: 4, itineraryDayByDay: "..." },
        current,
      ),
    ).toBeNull();
  });

  it("rejects empty title and invalid dates", () => {
    expect(validateProgramCardPatch({ title: "   " }, current)).toMatch(/title/);
    expect(validateProgramCardPatch({ startDate: "not-a-date" }, current)).toMatch(/startDate/);
    expect(validateProgramCardPatch({ endDate: null }, current)).toMatch(/endDate/);
  });

  it("checks end >= start against the stored value when only one date changes", () => {
    expect(validateProgramCardPatch({ endDate: "2026-10-01" }, current)).toMatch(/earlier/);
    expect(validateProgramCardPatch({ startDate: "2026-10-20" }, current)).toMatch(/earlier/);
  });

  it("validates duration and price but allows clearing price", () => {
    expect(validateProgramCardPatch({ durationDays: 0 }, current)).toMatch(/durationDays/);
    expect(validateProgramCardPatch({ priceFromRub: -5 }, current)).toMatch(/priceFromRub/);
    expect(validateProgramCardPatch({ priceFromRub: null }, current)).toBeNull();
    expect(validateProgramCardPatch({ priceFromRub: 45000 }, current)).toBeNull();
  });
});

describe("validateProgramMediaInput", () => {
  it("accepts http(s) and local cached media", () => {
    expect(validateProgramMediaInput("image", "https://example.org/a.jpg")).toBeNull();
    expect(validateProgramMediaInput("video", "/ingestion-media/a.mp4")).toBeNull();
  });

  it("rejects unknown types and unsafe urls", () => {
    expect(validateProgramMediaInput("audio", "https://example.org/a.mp3")).toMatch(/mediaType/);
    expect(validateProgramMediaInput("image", "javascript:alert(1)")).toMatch(/url/);
    expect(validateProgramMediaInput("image", "")).toMatch(/url/);
  });
});
