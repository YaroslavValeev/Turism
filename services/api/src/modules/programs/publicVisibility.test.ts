import { describe, expect, it } from "vitest";
import { isProgramPubliclyVisible } from "./publicVisibility";

const now = new Date("2026-07-20T12:00:00.000Z");

describe("isProgramPubliclyVisible", () => {
  it("shows a published program through its final calendar day", () => {
    expect(
      isProgramPubliclyVisible(
        { publishStatus: "published", endDate: "2026-07-20T00:00:00.000Z", spotsAvailable: 1 },
        now,
      ),
    ).toBe(true);
  });

  it("hides expired, sold-out, unpublished, and invalid-date programs", () => {
    expect(isProgramPubliclyVisible({ publishStatus: "published", endDate: "2026-07-19T23:59:59.000Z" }, now)).toBe(false);
    expect(isProgramPubliclyVisible({ publishStatus: "published", spotsAvailable: 0 }, now)).toBe(false);
    expect(isProgramPubliclyVisible({ publishStatus: "draft" }, now)).toBe(false);
    expect(isProgramPubliclyVisible({ publishStatus: "published", endDate: "not-a-date" }, now)).toBe(false);
  });

  it("hides auto-published ingestion records until operator review passes", () => {
    expect(isProgramPubliclyVisible({
      publishStatus: "published",
      endDate: "2026-07-21T00:00:00.000Z",
      autoPublished: true,
      reviewStatus: "auto_pending",
    }, now)).toBe(false);
    expect(isProgramPubliclyVisible({
      publishStatus: "published",
      endDate: "2026-07-21T00:00:00.000Z",
      autoPublished: true,
      reviewStatus: "ok",
    }, now)).toBe(true);
  });

  it("keeps legacy published programs visible when availability is unknown", () => {
    expect(isProgramPubliclyVisible({ publishStatus: "published", endDate: null, spotsAvailable: null }, now)).toBe(true);
  });
});
