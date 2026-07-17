import { describe, expect, it } from "vitest";
import { buildMvpDateWindow, MVP_CAMP_IDS } from "./ensure-camp-api-mvp";

describe("Camp API MVP fixture", () => {
  it("uses stable ids so repeated runs cannot create duplicates", () => {
    expect(MVP_CAMP_IDS).toEqual({
      organizer: "org_mywave_camp_api_mvp_v1",
      source: "source_mywave_camp_api_mvp_v1",
      program: "camp_api_mvp_wakesurf_v1",
      media: "media_mywave_camp_api_mvp_v1",
    });
  });

  it("builds a seven-day window 45 days in the future", () => {
    const { startDate, endDate } = buildMvpDateWindow(new Date("2026-07-17T18:00:00.000Z"));
    expect(startDate.toISOString()).toBe("2026-08-31T00:00:00.000Z");
    expect(endDate.toISOString()).toBe("2026-09-06T00:00:00.000Z");
  });
});
