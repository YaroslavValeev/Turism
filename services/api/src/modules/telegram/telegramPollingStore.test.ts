import { Prisma } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  stateCreate: vi.fn(),
  stateUpdateMany: vi.fn(),
  stateFind: vi.fn(),
  updateCreateMany: vi.fn(),
  updateFindMany: vi.fn(),
  updateUpdateMany: vi.fn(),
  updateDeleteMany: vi.fn(),
  transaction: vi.fn(),
}));

vi.mock("../../lib/prisma", () => ({
  prisma: {
    telegramPollingState: {
      create: mocks.stateCreate,
      updateMany: mocks.stateUpdateMany,
      findUniqueOrThrow: mocks.stateFind,
    },
    telegramPollingUpdate: {
      createMany: mocks.updateCreateMany,
      findMany: mocks.updateFindMany,
      updateMany: mocks.updateUpdateMany,
      deleteMany: mocks.updateDeleteMany,
    },
    $transaction: mocks.transaction,
  },
}));

import {
  acquireTelegramPollingLease,
  completeTelegramPollingUpdate,
  pendingTelegramPollingUpdates,
  storeTelegramPollingUpdates,
  telegramPollingOffset,
} from "./telegramPollingStore";

describe("Telegram polling durable store", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.transaction.mockImplementation(async (callback) => callback({
      telegramPollingState: { updateMany: mocks.stateUpdateMany },
      telegramPollingUpdate: { createMany: mocks.updateCreateMany },
    }));
  });

  it("claims a new singleton lease", async () => {
    mocks.stateUpdateMany.mockResolvedValue({ count: 0 });
    mocks.stateCreate.mockResolvedValue({ id: "main-bot" });
    expect(await acquireTelegramPollingLease("worker", new Date("2026-09-20T00:00:00Z"))).toBe(true);
    expect(mocks.stateCreate).toHaveBeenCalledWith({
      data: {
        id: "main-bot",
        leaseOwner: "worker",
        leaseExpiresAt: new Date("2026-09-20T00:01:30Z"),
      },
    });
  });

  it("claims an expired singleton lease without an expected unique-key error", async () => {
    mocks.stateUpdateMany.mockResolvedValue({ count: 1 });
    expect(await acquireTelegramPollingLease("worker", new Date("2026-09-20T00:00:00Z"))).toBe(true);
    expect(mocks.stateCreate).not.toHaveBeenCalled();
  });

  it("does not claim a lease held by another worker", async () => {
    mocks.stateCreate.mockRejectedValue(new Prisma.PrismaClientKnownRequestError("unique", {
      code: "P2002",
      clientVersion: "5.22.0",
    }));
    mocks.stateUpdateMany.mockResolvedValue({ count: 0 });
    expect(await acquireTelegramPollingLease("second")).toBe(false);
  });

  it("writes the entire batch and offset in one transaction", async () => {
    mocks.stateUpdateMany.mockResolvedValue({ count: 1 });
    mocks.updateCreateMany.mockResolvedValue({ count: 2 });
    const updates = [{ update_id: 10 }, { update_id: 11 }];
    await storeTelegramPollingUpdates("worker", updates, new Date("2026-09-20T00:00:00Z"));
    expect(mocks.transaction).toHaveBeenCalledOnce();
    expect(mocks.stateUpdateMany).toHaveBeenCalledWith(expect.objectContaining({
      data: { nextOffset: 12n, lastReceivedAt: new Date("2026-09-20T00:00:00Z") },
    }));
    expect(mocks.updateCreateMany).toHaveBeenCalledWith({
      data: [
        { updateId: 10n, payload: updates[0] },
        { updateId: 11n, payload: updates[1] },
      ],
      skipDuplicates: true,
    });
  });

  it("does not write inbox rows after lease loss", async () => {
    mocks.stateUpdateMany.mockResolvedValue({ count: 0 });
    await expect(storeTelegramPollingUpdates("old", [{ update_id: 12 }])).rejects.toThrow("lease lost");
    expect(mocks.updateCreateMany).not.toHaveBeenCalled();
  });

  it("rejects an update ID whose next offset would lose precision", async () => {
    await expect(storeTelegramPollingUpdates("worker", [{ update_id: Number.MAX_SAFE_INTEGER }])).rejects.toThrow(
      "Invalid Telegram update_id",
    );
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("resets an offset after a long idle period but retains a recent one", async () => {
    mocks.stateFind.mockResolvedValue({ nextOffset: 200n, lastReceivedAt: new Date("2026-09-19T00:00:00Z") });
    expect(await telegramPollingOffset(new Date("2026-09-20T00:00:00Z"))).toBe(200);
    mocks.stateFind.mockResolvedValue({ nextOffset: 200n, lastReceivedAt: new Date("2026-09-01T00:00:00Z") });
    expect(await telegramPollingOffset(new Date("2026-09-20T00:00:00Z"))).toBe(0);
  });

  it("retains a failed update briefly for recovery", async () => {
    mocks.updateUpdateMany.mockResolvedValue({ count: 1 });
    await completeTelegramPollingUpdate(12, { contentOk: true, platformOk: false });
    expect(mocks.updateUpdateMany).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        status: "failed",
        contentOk: true,
        platformOk: false,
      }),
    }));
    expect(mocks.updateUpdateMany.mock.calls[0]?.[0]?.data).not.toHaveProperty("payload");
  });

  it("clears personal update payload after successful dispatch", async () => {
    mocks.updateUpdateMany.mockResolvedValue({ count: 1 });
    await completeTelegramPollingUpdate(13, { contentOk: true, platformOk: true });
    expect(mocks.updateUpdateMany).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: "processed", payload: Prisma.DbNull }),
    }));
  });

  it("replays persisted pending rows after restart", async () => {
    const update = { update_id: 12, message: { text: "/ops" } };
    mocks.updateFindMany.mockResolvedValue([{ updateId: 12n, payload: update }]);
    expect(await pendingTelegramPollingUpdates()).toEqual([update]);
  });
});
