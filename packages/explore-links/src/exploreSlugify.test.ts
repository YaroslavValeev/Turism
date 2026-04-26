import { describe, expect, it } from "vitest";
import { valueToDefaultSlug, normToken } from "./exploreSlugify";
import { rawStringToHubSlug } from "./exploreMap";

describe("explore slugify", () => {
  it("нормализует регистр и пробелы", () => {
    expect(normToken("  Free Ride ")).toBe("free ride");
  });

  it("транслит + slug из кириллицы", () => {
    expect(valueToDefaultSlug("фрирайд")).toBe("frirayd");
    expect(valueToDefaultSlug("  Вейк  ")).toBe("veyk");
  });

  it("ручной mapping перекрывает default slug", () => {
    expect(rawStringToHubSlug("discipline", "фрирайд")).toBe("freeride");
    expect(rawStringToHubSlug("discipline", "FreeRide")).toBe("freeride");
  });
});
