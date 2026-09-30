import { describe, expect, it } from "vitest";
import {
  checkVerificationTransition,
  describeMergeBlockers,
  findSimilarOrganizers,
  isIngestionStubOrganizer,
  normalizeOrganizerName,
} from "./workflow";

describe("checkVerificationTransition", () => {
  it("raises trust one step at a time and only with evidence", () => {
    expect(checkVerificationTransition("listed", "checked", true)).toBeNull();
    expect(checkVerificationTransition("listed", "checked", false)).toMatch(/доказательство/);
    expect(checkVerificationTransition("listed", "trusted_by_platform", true)).toMatch(/Проверен/);
    expect(checkVerificationTransition("checked", "verified", true)).toBeNull();
    expect(checkVerificationTransition("verified", "trusted_by_platform", true)).toBeNull();
  });

  it("always allows lowering, pausing and rejecting", () => {
    expect(checkVerificationTransition("trusted_by_platform", "listed", false)).toBeNull();
    expect(checkVerificationTransition("verified", "paused", false)).toBeNull();
    expect(checkVerificationTransition("listed", "rejected", false)).toBeNull();
  });

  it("returns paused/rejected organizers to the ladder from the bottom", () => {
    expect(checkVerificationTransition("paused", "listed", false)).toBeNull();
    expect(checkVerificationTransition("rejected", "checked", true)).toBeNull();
    expect(checkVerificationTransition("paused", "verified", true)).toMatch(/одну ступень/);
  });

  it("rejects no-op transitions", () => {
    expect(checkVerificationTransition("checked", "checked", true)).toMatch(/уже/);
  });
});

describe("organizer duplicates", () => {
  it("detects ingestion stubs by the placeholder email", () => {
    expect(isIngestionStubOrganizer("ingestion+cm123@mywave.local")).toBe(true);
    expect(isIngestionStubOrganizer("hello@birdtravel.ru")).toBe(false);
    expect(isIngestionStubOrganizer(null)).toBe(false);
  });

  it("matches names regardless of case, quotes and legal form", () => {
    expect(normalizeOrganizerName("ООО «Bird Travel»")).toBe(normalizeOrganizerName("birdtravel"));
    const all = [
      { id: "a", displayName: "BirdTravel" },
      { id: "b", displayName: "Bird Travel Школа" },
      { id: "c", displayName: "Mountain Guru" },
    ];
    expect(findSimilarOrganizers(all[0], all).map((o) => o.id)).toEqual(["b"]);
    expect(findSimilarOrganizers({ id: "x", displayName: "A" }, all)).toEqual([]);
  });

  it("blocks automatic merge when money or contracts are attached", () => {
    expect(describeMergeBlockers({ bookings: 0, payments: 0 })).toBeNull();
    expect(describeMergeBlockers({ bookings: 2, contracts: 1 })).toBe(
      "У организатора есть бронирования: 2, договоры: 1 — объединение только вручную.",
    );
  });
});
