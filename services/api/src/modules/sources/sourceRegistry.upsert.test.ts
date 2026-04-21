import { describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { SOURCE_LIFECYCLE, SOURCE_ORIGIN, upsertSourceByTypeAndHandle } from "./sourceRegistry";

function mockDb(overrides: {
  findFirst: unknown;
  create?: ReturnType<typeof vi.fn>;
  update?: ReturnType<typeof vi.fn>;
}): PrismaClient {
  return {
    source: {
      findFirst: vi.fn().mockResolvedValue(overrides.findFirst),
      create: overrides.create ?? vi.fn(),
      update: overrides.update ?? vi.fn(),
    },
  } as unknown as PrismaClient;
}

describe("upsertSourceByTypeAndHandle — externalChannelId linkage", () => {
  it("передаёт externalChannelId при create", async () => {
    const create = vi.fn().mockResolvedValue({ id: "new-source" });
    const db = mockDb({ findFirst: null, create });

    await upsertSourceByTypeAndHandle(db, {
      type: "telegram",
      name: "Test org · telegram",
      urlOrHandle: "@mywave_test",
      organizerId: "org-1",
      sourceOrigin: SOURCE_ORIGIN.CONTRACT_AUTO,
      lifecycleState: SOURCE_LIFECYCLE.ACTIVE,
      externalChannelId: "channel-1",
      metaJson: { channelId: "channel-1" },
    });

    expect(create).toHaveBeenCalledTimes(1);
    const arg = create.mock.calls[0][0] as { data: { externalChannelId: string | null } };
    expect(arg.data.externalChannelId).toBe("channel-1");
  });

  it("обновляет externalChannelId, если передан явно (включая null)", async () => {
    const update = vi.fn().mockResolvedValue({ id: "existing" });
    const db = mockDb({
      findFirst: {
        id: "existing",
        name: "Old",
        organizerId: "org-1",
        parserProfile: null,
        fetchIntervalMinutes: 1440,
        isActive: true,
        sourceOrigin: SOURCE_ORIGIN.CONTRACT_AUTO,
        lifecycleState: SOURCE_LIFECYCLE.ACTIVE,
        discipline: null,
        country: null,
        region: null,
        importSessionId: null,
        metaJson: { channelId: "legacy" },
      },
      update,
    });

    await upsertSourceByTypeAndHandle(db, {
      type: "telegram",
      name: "Test org · telegram",
      urlOrHandle: "@mywave_test",
      organizerId: "org-1",
      sourceOrigin: SOURCE_ORIGIN.CONTRACT_AUTO,
      externalChannelId: null,
    });

    expect(update).toHaveBeenCalledTimes(1);
    const arg = update.mock.calls[0][0] as { data: { externalChannelId: null } };
    expect(arg.data.externalChannelId).toBeNull();
  });

  it("не трогает externalChannelId в update, если поле undefined", async () => {
    const update = vi.fn().mockResolvedValue({ id: "existing" });
    const db = mockDb({
      findFirst: {
        id: "existing",
        name: "Old",
        organizerId: "org-1",
        parserProfile: null,
        fetchIntervalMinutes: 1440,
        isActive: true,
        sourceOrigin: SOURCE_ORIGIN.CONTRACT_AUTO,
        lifecycleState: SOURCE_LIFECYCLE.ACTIVE,
        discipline: null,
        country: null,
        region: null,
        importSessionId: null,
        metaJson: {},
      },
      update,
    });

    await upsertSourceByTypeAndHandle(db, {
      type: "telegram",
      name: "Test org · telegram",
      urlOrHandle: "@mywave_test",
      organizerId: "org-1",
    });

    const arg = update.mock.calls[0][0] as { data: Record<string, unknown> };
    expect(arg.data.externalChannelId).toBeUndefined();
  });
});
