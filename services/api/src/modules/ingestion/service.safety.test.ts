import { beforeEach, describe, expect, it, vi } from "vitest";

const prismaMock = vi.hoisted(() => ({
  eventCandidate: { findMany: vi.fn() },
  $transaction: vi.fn(),
}));

vi.mock("../../lib/prisma", () => ({ prisma: prismaMock }));

import { autoPublishReadyCandidates, selectDueSourceIds } from "./service";

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
      { id: "inactive", isActive: false, lastCheckedAt: null, fetchIntervalMinutes: 1440 },
      { id: "recent", isActive: true, lastCheckedAt: new Date("2026-07-21T07:55:00.000Z"), fetchIntervalMinutes: 60 },
      { id: "due-1", isActive: true, lastCheckedAt: null, fetchIntervalMinutes: 1440 },
      { id: "due-2", isActive: true, lastCheckedAt: new Date("2026-07-19T08:00:00.000Z"), fetchIntervalMinutes: 1440 },
    ];

    expect(selectDueSourceIds(sources, 1, now)).toEqual(["due-1"]);
  });
});
