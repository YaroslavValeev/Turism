import { describe, expect, it } from "vitest";
import {
  checkVerificationTransition,
  describeMergeBlockers,
  findSimilarOrganizers,
  isIngestionStubOrganizer,
  normalizeOrganizerName,
  pickOrganizerByName,
  shouldLinkSourceToResolvedOrganizer,
  sourceMetaAfterManualOrganizerChange,
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

  it("prefers a live organizer over a rejected or merged one with the same name", () => {
    const rejected = { id: "old", verificationStatus: "rejected" };
    const live = { id: "new", verificationStatus: "listed" };
    expect(pickOrganizerByName([rejected, live])).toBe(live);
    expect(pickOrganizerByName([rejected])).toBe(rejected);
    expect(pickOrganizerByName([])).toBeNull();
  });

  it("blocks automatic merge when money or contracts are attached", () => {
    expect(describeMergeBlockers({ bookings: 0, payments: 0 })).toBeNull();
    expect(describeMergeBlockers({ bookings: 2, contracts: 1 })).toBe(
      "У организатора есть бронирования: 2, договоры: 1 — объединение только вручную.",
    );
  });
});

describe("shouldLinkSourceToResolvedOrganizer", () => {
  const base = { sourceName: "BirdTravel", sourceMetaJson: null, organizerStatus: "listed" };

  it("links a single-organizer source whose items carry no own organizer name", () => {
    expect(shouldLinkSourceToResolvedOrganizer({ ...base, itemOrganizerName: null })).toBe(true);
    expect(shouldLinkSourceToResolvedOrganizer({ ...base, itemOrganizerName: "  " })).toBe(true);
  });

  it("links when the item organizer is the source itself", () => {
    expect(shouldLinkSourceToResolvedOrganizer({ ...base, itemOrganizerName: "ООО «Bird Travel»" })).toBe(true);
  });

  it("keeps listings of other organizers unlinked", () => {
    expect(shouldLinkSourceToResolvedOrganizer({ ...base, itemOrganizerName: "Mountain Guru" })).toBe(false);
    expect(
      shouldLinkSourceToResolvedOrganizer({ ...base, sourceMetaJson: { multiOrganizer: true }, itemOrganizerName: null }),
    ).toBe(false);
    expect(
      shouldLinkSourceToResolvedOrganizer({ ...base, sourceMetaJson: { manualPosts: true }, itemOrganizerName: null }),
    ).toBe(false);
  });

  it("remembers a manual unlink so ingestion does not relink the source", () => {
    const unlinked = sourceMetaAfterManualOrganizerChange({ autoPublish: false }, false);
    expect(unlinked).toEqual({ autoPublish: false, multiOrganizer: true });
    expect(shouldLinkSourceToResolvedOrganizer({ ...base, sourceMetaJson: unlinked, itemOrganizerName: null })).toBe(false);
    expect(sourceMetaAfterManualOrganizerChange(unlinked, true)).toEqual({ autoPublish: false });
  });

  it("never links to a rejected organizer", () => {
    expect(shouldLinkSourceToResolvedOrganizer({ ...base, itemOrganizerName: null, organizerStatus: "rejected" })).toBe(
      false,
    );
  });
});
