import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const tx = {
    eventCandidate: {
      findMany: vi.fn(),
      update: vi.fn(),
    },
    eventGroup: {
      findMany: vi.fn(),
      create: vi.fn(),
    },
    auditLog: {
      create: vi.fn(),
    },
  };

  const prisma = {
    $transaction: vi.fn(),
    eventCandidate: {
      findMany: vi.fn(),
      update: vi.fn(),
    },
    eventGroup: {
      upsert: vi.fn(),
      update: vi.fn(),
    },
    auditLog: {
      create: vi.fn(),
    },
  };

  return { prisma, tx };
});

vi.mock("../../lib/prisma", () => ({ prisma: mocks.prisma }));

import { runDedupCandidatesJob, runDedupJob } from "./service";

function candidate(
  id: string,
  overrides: Record<string, unknown> = {},
) {
  return {
    id,
    normalizedItemId: `normalized-${id}`,
    dedupGroupId: null,
    status: "needs_review",
    reviewPriority: 80,
    trustScore: 0.8,
    fitScore: 0.8,
    futureEventScore: 0.8,
    duplicateScore: 0,
    finalScore: 0.8,
    eventLikelihoodScore: 0.8,
    completenessScore: 0.8,
    sourceTrustScore: 0.8,
    tourismFitScore: 0.8,
    decisionNotes: null,
    reviewedBy: null,
    reviewedAt: null,
    createdAt: new Date("2026-07-21T20:00:00.000Z"),
    updatedAt: new Date("2026-07-21T20:00:00.000Z"),
    publishedProgram: null,
    normalizedItem: {
      id: `normalized-${id}`,
      rawItemId: `raw-${id}`,
      title: "Enduro race",
      organizerName: "Enduro organizer",
      region: "Moscow",
      city: null,
      startDate: new Date("2026-08-10T00:00:00.000Z"),
      discipline: "enduro",
      rawItem: {
        id: `raw-${id}`,
        sourceId: "source-new",
        source: {
          id: "source-new",
          type: "telegram",
          name: "New source",
          organizerId: null,
          organizer: null,
        },
      },
    },
    ...overrides,
  };
}

describe("candidate-scoped ingestion dedup", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.prisma.$transaction.mockImplementation(async (callback) => callback(mocks.tx));
    mocks.tx.eventGroup.findMany.mockResolvedValue([]);
    mocks.tx.eventCandidate.update.mockResolvedValue({});
    mocks.tx.auditLog.create.mockResolvedValue({});
  });

  it("groups only the explicit candidate IDs and leaves old published state untouched", async () => {
    const first = candidate("candidate-1", { finalScore: 0.9 });
    const duplicate = candidate("candidate-2", { finalScore: 0.7 });
    const separate = candidate("candidate-3", {
      finalScore: 0.85,
      normalizedItem: {
        ...candidate("candidate-3").normalizedItem,
        title: "Different enduro event",
      },
    });
    mocks.tx.eventCandidate.findMany.mockResolvedValue([first, separate, duplicate]);
    mocks.tx.eventGroup.create
      .mockResolvedValueOnce({ id: "group-shared" })
      .mockResolvedValueOnce({ id: "group-separate" });

    const result = await runDedupCandidatesJob("admin-1", ["candidate-1", "candidate-2", "candidate-3"]);

    expect(result).toEqual({
      scope: "candidates:3",
      processed: 3,
      created: 2,
      updated: 3,
    });
    expect(mocks.tx.eventCandidate.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: { in: ["candidate-1", "candidate-2", "candidate-3"] } },
      }),
    );
    expect(mocks.tx.eventCandidate.update.mock.calls.map(([args]) => args.where.id).sort()).toEqual([
      "candidate-1",
      "candidate-2",
      "candidate-3",
    ]);
    expect(mocks.tx.eventCandidate.update).not.toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "old-published-candidate" } }),
    );
    expect(mocks.tx.eventGroup.create).toHaveBeenCalledTimes(2);
    expect(mocks.prisma.eventGroup.update).not.toHaveBeenCalled();
    expect(mocks.prisma.eventCandidate.update).not.toHaveBeenCalled();
  });

  it("rejects an existing group-key collision before any write", async () => {
    mocks.tx.eventCandidate.findMany.mockResolvedValue([candidate("candidate-1")]);
    mocks.tx.eventGroup.findMany.mockResolvedValue([{ groupKey: "existing-key" }]);

    await expect(runDedupCandidatesJob(null, ["candidate-1"])).rejects.toThrow("group key collision");

    expect(mocks.tx.eventGroup.create).not.toHaveBeenCalled();
    expect(mocks.tx.eventCandidate.update).not.toHaveBeenCalled();
    expect(mocks.tx.auditLog.create).not.toHaveBeenCalled();
  });

  it.each(["approved", "published", "archived", "rejected", "merged", "new"])(
    "rejects %s candidates before checking or writing groups",
    async (status) => {
      mocks.tx.eventCandidate.findMany.mockResolvedValue([candidate("candidate-1", { status })]);

      await expect(runDedupCandidatesJob(null, ["candidate-1"])).rejects.toThrow("not in needs_review status");

      expect(mocks.tx.eventGroup.findMany).not.toHaveBeenCalled();
      expect(mocks.tx.eventGroup.create).not.toHaveBeenCalled();
      expect(mocks.tx.eventCandidate.update).not.toHaveBeenCalled();
    },
  );

  it("rejects a published relation even if the status is needs_review", async () => {
    mocks.tx.eventCandidate.findMany.mockResolvedValue([
      candidate("candidate-1", {
        publishedProgram: { id: "published-link", candidateId: "candidate-1" },
      }),
    ]);

    await expect(runDedupCandidatesJob(null, ["candidate-1"])).rejects.toThrow("already published");

    expect(mocks.tx.eventGroup.findMany).not.toHaveBeenCalled();
    expect(mocks.tx.eventGroup.create).not.toHaveBeenCalled();
    expect(mocks.tx.eventCandidate.update).not.toHaveBeenCalled();
  });

  it("rejects already-grouped candidates before any write", async () => {
    mocks.tx.eventCandidate.findMany.mockResolvedValue([
      candidate("candidate-1", { dedupGroupId: "old-group" }),
    ]);

    await expect(runDedupCandidatesJob(null, ["candidate-1"])).rejects.toThrow("already grouped");

    expect(mocks.tx.eventGroup.findMany).not.toHaveBeenCalled();
    expect(mocks.tx.eventGroup.create).not.toHaveBeenCalled();
    expect(mocks.tx.eventCandidate.update).not.toHaveBeenCalled();
  });

  it("rejects missing, duplicate, and blank IDs without writes", async () => {
    mocks.tx.eventCandidate.findMany.mockResolvedValue([]);

    await expect(runDedupCandidatesJob(null, ["missing"])).rejects.toThrow("were not found");
    await expect(runDedupCandidatesJob(null, ["duplicate", "duplicate"])).rejects.toThrow("must not contain duplicates");
    await expect(runDedupCandidatesJob(null, [""])).rejects.toThrow("non-empty IDs");

    expect(mocks.tx.eventGroup.create).not.toHaveBeenCalled();
    expect(mocks.tx.eventCandidate.update).not.toHaveBeenCalled();
  });

  it("keeps the legacy source-scoped dedup contract working", async () => {
    mocks.prisma.eventCandidate.findMany.mockResolvedValue([candidate("legacy-candidate")]);
    mocks.prisma.eventGroup.upsert.mockResolvedValue({ id: "legacy-group" });
    mocks.prisma.eventGroup.update.mockResolvedValue({});
    mocks.prisma.eventCandidate.update.mockResolvedValue({});
    mocks.prisma.auditLog.create.mockResolvedValue({});

    await expect(runDedupJob("admin-1", ["source-new"])).resolves.toEqual({
      scope: "sources:1",
      processed: 1,
      created: 1,
      updated: 1,
    });

    expect(mocks.prisma.eventCandidate.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          normalizedItem: { rawItem: { sourceId: { in: ["source-new"] } } },
        }),
      }),
    );
  });
});
