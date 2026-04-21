import { describe, expect, it } from "vitest";
import type { Env } from "@mywave/config";
import { isConversionStageAutomationAllowed } from "./rolloutPolicy";

const base = {
  CONVERSION_ALLOWED_MAX_STAGE: 5,
  CONVERSION_ENABLE_STAGE4: false,
  CONVERSION_ENABLE_STAGE5: false,
  CONVERSION_ENABLE_FOLLOWUP: true,
} as unknown as Env;

describe("rolloutPolicy", () => {
  it("stage 0 always allowed", () => {
    expect(isConversionStageAutomationAllowed({ ...base, CONVERSION_ALLOWED_MAX_STAGE: 0 }, 0)).toBe(true);
  });

  it("respects max stage", () => {
    const env = { ...base, CONVERSION_ALLOWED_MAX_STAGE: 2 };
    expect(isConversionStageAutomationAllowed(env, 2)).toBe(true);
    expect(isConversionStageAutomationAllowed(env, 3)).toBe(false);
  });

  it("stage 4/5 need explicit flags", () => {
    const env = { ...base, CONVERSION_ALLOWED_MAX_STAGE: 5, CONVERSION_ENABLE_STAGE4: false, CONVERSION_ENABLE_STAGE5: false };
    expect(isConversionStageAutomationAllowed(env, 4)).toBe(false);
    expect(isConversionStageAutomationAllowed(env, 5)).toBe(false);
    expect(isConversionStageAutomationAllowed({ ...env, CONVERSION_ENABLE_STAGE4: true }, 4)).toBe(true);
    expect(isConversionStageAutomationAllowed({ ...env, CONVERSION_ENABLE_STAGE5: true }, 5)).toBe(true);
  });

  it("follow-up gated by CONVERSION_ENABLE_FOLLOWUP", () => {
    expect(isConversionStageAutomationAllowed({ ...base, CONVERSION_ENABLE_FOLLOWUP: false }, -1)).toBe(false);
    expect(isConversionStageAutomationAllowed({ ...base, CONVERSION_ENABLE_FOLLOWUP: true }, -1)).toBe(true);
  });
});
