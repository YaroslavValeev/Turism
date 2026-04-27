import { describe, it, expect } from "vitest";
import { checkSafetyHeuristic } from "./safetyHeuristic";

describe("checkSafetyHeuristic", () => {
  it("находит жёсткие формулировки", () => {
    const r = checkSafetyHeuristic("Это полностью безопасно для всех.");
    expect(r.hasRiskyClaims).toBe(true);
    expect(r.riskyPhrases.length).toBeGreaterThan(0);
    expect(r.severity).toBe("high");
  });

  it("чистый текст — нет флагов", () => {
    const r = checkSafetyHeuristic("Программа в Майкопе, уровень intermediate.");
    expect(r.hasRiskyClaims).toBe(false);
    expect(r.severity).toBe("low");
  });
});
