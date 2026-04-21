import { describe, expect, it } from "vitest";
import type { Env } from "@mywave/config";
import type { ProgramConversionMetrics } from "./metrics";
import {
  meetsStage3GrowthRequirement,
  type ProgramConversionStateSlice,
  shouldSendStage1,
  shouldSendStage2,
  shouldSendStage3,
  shouldSendStage4,
  shouldSendStage5,
  shouldSendFollowUp,
  weekOverWeekViewsGrowthPct,
} from "./rules";

const emptyState: ProgramConversionStateSlice = {
  stage0SentAt: null,
  stage1SentAt: null,
  stage2SentAt: null,
  stage3SentAt: null,
  stage4SentAt: null,
  stage5SentAt: null,
  stage4EligibleAt: null,
  followUpDueAt: null,
  followUpSentAt: null,
};

const baseEnv = {
  CONVERSION_STAGE1_MIN_VIEWS: 50,
  CONVERSION_STAGE1_MIN_CLICKS: 10,
  CONVERSION_STAGE2_MIN_LEADS: 3,
  CONVERSION_STAGE3_MIN_VIEWS: 100,
  CONVERSION_STAGE3_MIN_CLICKS: 30,
  CONVERSION_STAGE3_MIN_LEADS: 5,
  CONVERSION_STAGE3_REQUIRE_LEADS_AND_GROWTH: false,
  CONVERSION_WEEK_GROWTH_MIN_PCT: 5,
  CONVERSION_STAGE5_MIN_LEADS: 10,
  CONVERSION_STAGE5_MIN_DEALS: 1,
  CONVERSION_ENABLE_FOLLOWUP: false,
} as unknown as Env;

describe("conversion funnel rules", () => {
  it("stage1 by views", () => {
    const m = { views: 50, clicks: 0, leads: 0, deals: 0, viewsThisWeek: 0, viewsPrevWeek: 0 };
    expect(shouldSendStage1(baseEnv, m)).toBe(true);
  });

  it("stage1 by clicks", () => {
    const m = { views: 0, clicks: 10, leads: 0, deals: 0, viewsThisWeek: 0, viewsPrevWeek: 0 };
    expect(shouldSendStage1(baseEnv, m)).toBe(true);
  });

  it("stage3 requires all three axes", () => {
    const ok = { views: 100, clicks: 30, leads: 5, deals: 0, viewsThisWeek: 0, viewsPrevWeek: 10 };
    expect(shouldSendStage3(baseEnv, ok, emptyState)).toBe(true);
    expect(shouldSendStage3(baseEnv, { ...ok, views: 99 }, emptyState)).toBe(false);
  });

  it("stage3 waits for follow-up when follow-up is enabled and pending", () => {
    const ok = { views: 100, clicks: 30, leads: 5, deals: 0, viewsThisWeek: 0, viewsPrevWeek: 10 };
    const past = new Date("2026-01-01T00:00:00Z");
    const env = { ...baseEnv, CONVERSION_ENABLE_FOLLOWUP: true } as Env;
    const pendingFollowUp: ProgramConversionStateSlice = {
      ...emptyState,
      stage2SentAt: past,
      followUpDueAt: past,
      followUpSentAt: null,
    };
    expect(shouldSendStage3(env, ok, pendingFollowUp)).toBe(false);
    expect(shouldSendStage3(env, ok, { ...pendingFollowUp, followUpSentAt: past })).toBe(true);
  });

  it("stage3 growth gate when enabled", () => {
    const env = { ...baseEnv, CONVERSION_STAGE3_REQUIRE_LEADS_AND_GROWTH: true, CONVERSION_WEEK_GROWTH_MIN_PCT: 10 };
    const m: ProgramConversionMetrics = {
      views: 100,
      clicks: 30,
      leads: 5,
      deals: 0,
      viewsThisWeek: 11,
      viewsPrevWeek: 10,
    };
    expect(meetsStage3GrowthRequirement(env, m)).toBe(true);
    expect(shouldSendStage3(env, m, emptyState)).toBe(true);
    const flat: ProgramConversionMetrics = { ...m, viewsThisWeek: 10, viewsPrevWeek: 10 };
    expect(meetsStage3GrowthRequirement(env, flat)).toBe(false);
  });

  it("wow pct when prev week zero", () => {
    const m: ProgramConversionMetrics = {
      views: 0,
      clicks: 0,
      leads: 0,
      deals: 0,
      viewsThisWeek: 3,
      viewsPrevWeek: 0,
    };
    expect(weekOverWeekViewsGrowthPct(m)).toBe(100);
  });

  it("stage4 only after eligible time", () => {
    const now = new Date("2026-01-10T12:00:00Z");
    const past = new Date("2026-01-01T12:00:00Z");
    expect(
      shouldSendStage4(
        baseEnv,
        { views: 0, clicks: 0, leads: 0, deals: 0, viewsThisWeek: 0, viewsPrevWeek: 0 },
        {
          stage0SentAt: past,
          stage1SentAt: past,
          stage2SentAt: past,
          stage3SentAt: past,
          stage4SentAt: null,
          stage5SentAt: null,
          stage4EligibleAt: new Date("2026-01-09T12:00:00Z"),
          followUpDueAt: null,
          followUpSentAt: null,
        },
        now,
      ),
    ).toBe(true);
  });

  it("stage5 by deals or leads", () => {
    const m = { views: 0, clicks: 0, leads: 0, deals: 1, viewsThisWeek: 0, viewsPrevWeek: 0 };
    expect(shouldSendStage5(baseEnv, m)).toBe(true);
    expect(shouldSendStage5(baseEnv, { ...m, deals: 0, leads: 10 })).toBe(true);
    expect(shouldSendStage5(baseEnv, { ...m, deals: 0, leads: 9 })).toBe(false);
  });

  it("follow-up window", () => {
    const due = new Date("2026-01-01T00:00:00Z");
    expect(
      shouldSendFollowUp(
        {
          stage0SentAt: null,
          stage1SentAt: null,
          stage2SentAt: null,
          stage3SentAt: null,
          stage4SentAt: null,
          stage5SentAt: null,
          stage4EligibleAt: null,
          followUpDueAt: due,
          followUpSentAt: null,
        },
        new Date("2026-01-02T00:00:00Z"),
      ),
    ).toBe(true);
  });
});
