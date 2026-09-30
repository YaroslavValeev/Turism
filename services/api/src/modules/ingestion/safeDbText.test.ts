import { describe, expect, it } from "vitest";
import { toSafeDbText, toSafeDbValue } from "./safeDbText";

describe("toSafeDbText", () => {
  it("drops an emoji half left by truncation and NUL bytes, keeps whole emoji", () => {
    const cut = "Кэмп 🏄".slice(0, -1);
    expect(toSafeDbText(cut)).toBe("Кэмп ");
    expect(toSafeDbText("a\u0000b")).toBe("ab");
    expect(toSafeDbText("Волна 🌊 ок")).toBe("Волна 🌊 ок");
    expect(() => JSON.parse(JSON.stringify(toSafeDbText("\uDC00x")))).not.toThrow();
  });

  it("cleans nested payloads without touching dates and numbers", () => {
    const date = new Date("2026-10-01T00:00:00Z");
    const out = toSafeDbValue({ text: "x\uD83D", list: ["\uDE00y"], n: 3, at: date, nil: null });
    expect(out).toEqual({ text: "x", list: ["y"], n: 3, at: date, nil: null });
  });
});
