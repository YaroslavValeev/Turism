import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  tx: {
    sourceProposal: {
      findUnique: vi.fn(),
      updateMany: vi.fn(),
      findUniqueOrThrow: vi.fn(),
    },
    source: { findMany: vi.fn(), create: vi.fn() },
    auditLog: { createMany: vi.fn() },
  },
  prisma: { $transaction: vi.fn() },
}));

vi.mock("../../lib/prisma", () => ({ prisma: mocks.prisma }));
vi.mock("../../lib/audit", () => ({ writeAuditLog: vi.fn() }));

import { approveSourceProposal, normalizeProposedSourceUrl, sourceUrlMatchesProposal } from "./sourceProposal";

const pendingProposal = {
  id: "proposal-1",
  normalizedUrl: "https://t.me/RusKiteNews",
  detectedType: "telegram",
  displayName: "Russian Kite News",
  organizerName: "Kite Org",
  notes: null,
  submittedVia: "telegram",
  submittedBy: "operator-1",
  status: "pending",
  rejectionReason: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

beforeEach(() => {
  vi.resetAllMocks();
  mocks.prisma.$transaction.mockImplementation(async (callback: (tx: typeof mocks.tx) => Promise<unknown>) => callback(mocks.tx));
});

describe("source proposal duplicate matching", () => {
  it("matches a legacy Telegram post URL with its canonical channel proposal URL", () => {
    const proposal = normalizeProposedSourceUrl("https://t.me/s/RusKiteNews/460");

    expect(proposal).toEqual({
      normalizedUrl: "https://t.me/RusKiteNews",
      detectedType: "telegram",
    });
    expect(
      sourceUrlMatchesProposal("telegram", "https://t.me/s/RusKiteNews/460", proposal.normalizedUrl),
    ).toBe(true);
  });

  it("does not match a different Telegram channel", () => {
    expect(
      sourceUrlMatchesProposal("telegram", "https://t.me/s/AnotherKiteNews/460", "https://t.me/RusKiteNews"),
    ).toBe(false);
  });
});

describe("source proposal approval", () => {
  it("creates only an inactive non-autopublishing source and records both audit events", async () => {
    mocks.tx.sourceProposal.findUnique.mockResolvedValue(pendingProposal);
    mocks.tx.source.findMany.mockResolvedValue([]);
    mocks.tx.sourceProposal.updateMany.mockResolvedValue({ count: 1 });
    mocks.tx.source.create.mockResolvedValue({ id: "source-1" });
    mocks.tx.sourceProposal.findUniqueOrThrow.mockResolvedValue({ ...pendingProposal, status: "approved" });
    mocks.tx.auditLog.createMany.mockResolvedValue({ count: 2 });

    const result = await approveSourceProposal(pendingProposal.id, "admin-1");

    expect(result).toMatchObject({ kind: "approved", source: { id: "source-1" } });
    expect(mocks.tx.source.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        type: "telegram",
        name: "Russian Kite News",
        urlOrHandle: "https://t.me/RusKiteNews",
        isActive: false,
        fetchIntervalMinutes: 1440,
        metaJson: expect.objectContaining({
          autoPublish: false,
          sourceOrigin: "source_proposal",
          lifecycleState: "inactive",
          sourceProposalId: "proposal-1",
        }),
      }),
    });
    expect(mocks.tx.sourceProposal.updateMany).toHaveBeenCalledWith({
      where: { id: "proposal-1", status: "pending" },
      data: { status: "approved", rejectionReason: null },
    });
    expect(mocks.tx.auditLog.createMany).toHaveBeenCalledWith({
      data: expect.arrayContaining([
        expect.objectContaining({ entityType: "source_proposal", changedField: "approved_as_inactive_source" }),
        expect.objectContaining({ entityType: "source", changedField: "created_from_source_proposal" }),
      ]),
    });
  });

  it("does not create a duplicate when a legacy Telegram post URL already exists", async () => {
    mocks.tx.sourceProposal.findUnique.mockResolvedValue(pendingProposal);
    mocks.tx.source.findMany.mockResolvedValue([{ id: "source-existing", urlOrHandle: "https://t.me/s/RusKiteNews/460" }]);

    await expect(approveSourceProposal(pendingProposal.id, "admin-1")).resolves.toEqual({
      kind: "existing_source",
      sourceId: "source-existing",
    });
    expect(mocks.tx.sourceProposal.updateMany).not.toHaveBeenCalled();
    expect(mocks.tx.source.create).not.toHaveBeenCalled();
    expect(mocks.tx.auditLog.createMany).not.toHaveBeenCalled();
  });
});
