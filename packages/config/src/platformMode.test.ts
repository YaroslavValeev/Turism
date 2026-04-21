import { describe, expect, it } from "vitest";
import { isLaunchMode, parsePlatformMode } from "./platformMode";

describe("parsePlatformMode", () => {
  it("defaults to launch", () => {
    expect(parsePlatformMode(undefined)).toBe("launch");
  });
  it("accepts monetization", () => {
    expect(parsePlatformMode("monetization")).toBe("monetization");
    expect(parsePlatformMode("MONETIZATION")).toBe("monetization");
  });
  it("maps unknown to launch", () => {
    expect(parsePlatformMode("prod")).toBe("launch");
  });
});

describe("isLaunchMode", () => {
  it("detects launch", () => {
    expect(isLaunchMode("launch")).toBe(true);
    expect(isLaunchMode("monetization")).toBe(false);
  });
});
