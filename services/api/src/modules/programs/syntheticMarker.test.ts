import { describe, expect, it } from "vitest";
import { containsSyntheticMarker } from "./syntheticMarker";

describe("containsSyntheticMarker", () => {
  it("не путает настоящие слова с маркером «тест»", () => {
    expect(containsSyntheticMarker("Школа альпинизма и скалолазания на естественном рельефе")).toBe(false);
    expect(containsSyntheticMarker("Протестируем новые доски на воде")).toBe(false);
  });

  it("ловит тестовые программы", () => {
    expect(containsSyntheticMarker("Тестовая программа")).toBe(true);
    expect(containsSyntheticMarker("тест")).toBe(true);
    expect(containsSyntheticMarker("E2E kite camp")).toBe(true);
    expect(containsSyntheticMarker("Синтетический организатор")).toBe(true);
    expect(containsSyntheticMarker("cmof123")).toBe(true);
  });
});
