import { beforeEach, describe, expect, it, vi } from "vitest";

const prismaMock = vi.hoisted(() => ({
  eventCandidate: { findMany: vi.fn() },
  $transaction: vi.fn(),
}));

vi.mock("../../lib/prisma", () => ({ prisma: prismaMock }));

import {
  autoPublishReadyCandidates,
  normalizeInstagramSourceUrlCandidate,
  selectDueSourceIds,
  shouldRunAutoPublishForSource,
} from "./service";

describe("daily ingestion safety", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it.each([undefined, false])("does not enter the Program publish path when autopublish is %s", async (enabled) => {
    const result =
      enabled === undefined
        ? await autoPublishReadyCandidates(null)
        : await autoPublishReadyCandidates(null, { autoPublishEnabled: enabled });

    expect(result.published).toBe(0);
    expect(prismaMock.eventCandidate.findMany).not.toHaveBeenCalled();
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it("selects only the configured number of due sources in priority order", () => {
    const now = new Date("2026-07-21T08:00:00.000Z");
    const sources = Array.from({ length: 8 }, (_, index) => ({
      id: `source-${index + 1}`,
      isActive: true,
      lastCheckedAt: null,
      fetchIntervalMinutes: 1440,
      priority: index + 1,
    }));

    expect(selectDueSourceIds(sources, 5, now)).toEqual([
      "source-1",
      "source-2",
      "source-3",
      "source-4",
      "source-5",
    ]);
  });

  it("excludes inactive and not-yet-due sources before applying the limit", () => {
    const now = new Date("2026-07-21T08:00:00.000Z");
    const sources = [
      { id: "inactive", isActive: false, lastCheckedAt: null, fetchIntervalMinutes: 1440, priority: 1 },
      { id: "recent", isActive: true, lastCheckedAt: new Date("2026-07-21T07:55:00.000Z"), fetchIntervalMinutes: 60, priority: 1 },
      { id: "due-1", isActive: true, lastCheckedAt: null, fetchIntervalMinutes: 1440, priority: 2 },
      { id: "due-2", isActive: true, lastCheckedAt: new Date("2026-07-19T08:00:00.000Z"), fetchIntervalMinutes: 1440, priority: 1 },
    ];

    expect(selectDueSourceIds(sources, 1, now)).toEqual(["due-1"]);
  });

  it("selects never-checked and stalest due sources before recently checked high-priority sources", () => {
    const now = new Date("2026-08-05T08:00:00.000Z");
    const sources = [
      {
        id: "recent-high-priority",
        isActive: true,
        lastCheckedAt: new Date("2026-08-04T07:00:00.000Z"),
        fetchIntervalMinutes: 1440,
        priority: 1,
      },
      {
        id: "stalest-lower-priority",
        isActive: true,
        lastCheckedAt: new Date("2026-07-29T08:00:00.000Z"),
        fetchIntervalMinutes: 1440,
        priority: 50,
      },
      {
        id: "never-checked",
        isActive: true,
        lastCheckedAt: null,
        fetchIntervalMinutes: 1440,
        priority: 100,
      },
    ];

    expect(selectDueSourceIds(sources, 2, now)).toEqual([
      "never-checked",
      "stalest-lower-priority",
    ]);
  });

  it.each([
    ["global disabled", false, true, true, "verified", false],
    ["inactive source", true, false, true, "verified", false],
    ["source opt-in absent", true, true, undefined, "verified", false],
    ["source opt-in false", true, true, false, "verified", false],
    ["organizer merely listed", true, true, true, "listed", false],
    ["organizer checked", true, true, true, "checked", false],
    ["organizer missing", true, true, true, null, false],
    ["verified organizer", true, true, true, "verified", true],
    ["platform-trusted organizer", true, true, true, "trusted_by_platform", true],
  ])(
    "uses an explicit source and organizer trust gate: %s",
    (_case, globalEnabled, isActive, sourceOptIn, organizerStatus, expected) => {
      expect(
        shouldRunAutoPublishForSource(
          {
            isActive,
            metaJson: sourceOptIn === undefined ? {} : { autoPublish: sourceOptIn },
            organizer: organizerStatus ? { verificationStatus: organizerStatus } : null,
          },
          globalEnabled,
        ),
      ).toBe(expected);
    },
  );

  it.each([
    ["team_sergeev", "https://www.instagram.com/team_sergeev/"],
    ["@wakehouse.ru", "https://www.instagram.com/wakehouse.ru/"],
    ["https://www.instagram.com/kaif_camp/", "https://www.instagram.com/kaif_camp/"],
  ])("normalizes an auxiliary Instagram candidate %s", (candidate, expected) => {
    expect(normalizeInstagramSourceUrlCandidate(candidate)).toBe(expected);
  });

  it.each(["not a valid handle", "https://[broken", "@too/many/segments"])(
    "drops an invalid auxiliary Instagram candidate %s",
    (candidate) => {
      expect(normalizeInstagramSourceUrlCandidate(candidate)).toBeNull();
    },
  );
});
