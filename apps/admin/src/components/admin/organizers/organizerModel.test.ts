import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { canHaveAutoPublish, nextVerificationStep, organizerChecklist, type OrganizerOverview } from "./organizerModel";

function overview(patch: Partial<OrganizerOverview["organizer"]> = {}, extra: Partial<OrganizerOverview> = {}): OrganizerOverview {
  return {
    organizer: {
      id: "o1",
      displayName: "BirdTravel",
      legalStatus: null,
      contactEmail: "ingestion+c1@mywave.local",
      contactPhone: null,
      verificationStatus: "listed",
      autoPublishApprovedAt: null,
      autoPublishApprovedBy: null,
      isIngestionStub: true,
      createdAt: "2026-09-01T00:00:00.000Z",
      ...patch,
    },
    evidence: [],
    sources: [],
    programs: [],
    similar: [],
    storefrontHidden: false,
    ...extra,
  };
}

describe("nextVerificationStep", () => {
  it("walks the ladder one step at a time", () => {
    assert.equal(nextVerificationStep("listed")?.target, "checked");
    assert.equal(nextVerificationStep("checked")?.target, "verified");
    assert.equal(nextVerificationStep("verified")?.target, "trusted_by_platform");
    assert.equal(nextVerificationStep("trusted_by_platform"), null);
  });

  it("returns paused/rejected organizers to the catalog first", () => {
    assert.equal(nextVerificationStep("paused")?.target, "listed");
    assert.equal(nextVerificationStep("rejected")?.target, "listed");
  });
});

describe("organizerChecklist", () => {
  it("flags ingestion stubs and missing sources", () => {
    const items = organizerChecklist(overview());
    assert.deepEqual(items.map((i) => i.done), [false, false, false, false]);
    assert.match(items[0].hint, /заглушк/);
  });

  it("marks a verified organizer with sources and published programs as done", () => {
    const items = organizerChecklist(
      overview(
        { verificationStatus: "verified", isIngestionStub: false, contactEmail: "hi@birdtravel.ru" },
        {
          sources: [{ id: "s", name: "Сайт", type: "site", urlOrHandle: "https://birdtravel.ru", isActive: true, lastSuccessAt: null, autoPublishOptOut: false }],
          programs: [{ id: "p", title: "Кемп", publishStatus: "published", reviewStatus: "ok", autoPublished: true, startDate: "", endDate: "", discipline: "", region: "" }],
        },
      ),
    );
    assert.deepEqual(items.map((i) => i.done), [true, true, true, true]);
  });

  it("explains that paused organizers are hidden from the site", () => {
    const items = organizerChecklist(overview({ verificationStatus: "paused" }, { storefrontHidden: true }));
    assert.match(items[1].hint, /скрыты/);
  });

  it("allows autopublish only for verified and trusted organizers", () => {
    assert.equal(canHaveAutoPublish("checked"), false);
    assert.equal(canHaveAutoPublish("verified"), true);
  });
});
