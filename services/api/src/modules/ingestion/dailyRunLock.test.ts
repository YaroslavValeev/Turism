import { beforeEach, describe, expect, it, vi } from "vitest";

const prismaMock = vi.hoisted(() => ({
  schedulerDailyRun: {
    findUnique: vi.fn(),
    create: vi.fn(),
    updateMany: vi.fn(),
  },
}));

vi.mock("../../lib/prisma", () => ({ prisma: prismaMock }));

import { claimDailyRun } from "./dailyRunLock";

describe("claimDailyRun", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("does not create again for an existing successful source-proposal digest lock", async () => {
    prismaMock.schedulerDailyRun.findUnique.mockResolvedValue({ id: "existing" });
    prismaMock.schedulerDailyRun.updateMany.mockResolvedValue({ count: 0 });

    await expect(
      claimDailyRun("2026-09-01", new Date("2026-09-01T09:00:00.000Z"), "source-proposal-digest"),
    ).resolves.toBeNull();

    expect(prismaMock.schedulerDailyRun.create).not.toHaveBeenCalled();
    expect(prismaMock.schedulerDailyRun.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ jobKey: "source-proposal-digest", dayKey: "2026-09-01" }),
      }),
    );
  });
});
