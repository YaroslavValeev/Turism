import { describe, expect, it, vi, beforeEach } from "vitest";
import type { Env } from "@mywave/config";
import { CONVERSION_DRAFT_STATUS, draftDedupeKey, isOwnerGovernanceStage } from "./constants";

vi.mock("../../../lib/audit", () => ({ writeAuditLog: vi.fn().mockResolvedValue(undefined) }));
vi.mock("./ownerTelegram", () => ({
  answerTelegramCallbackQuery: vi.fn().mockResolvedValue(undefined),
  sendOwnerConversionDraftTelegram: vi.fn(),
}));

import { handleConversionTelegramWebhook } from "./draftService";

const env = {
  CONVERSION_OWNER_DEFER_HOURS: 24,
  TELEGRAM_BOT_API_BASE_URL: "https://api.telegram.org/botx",
} as unknown as Env;

describe("conversion draft governance", () => {
  it("draftDedupeKey is stable per program+stage", () => {
    expect(draftDedupeKey("p1", 3)).toBe("conversion_draft_trigger:p1:stage:3");
  });

  it("isOwnerGovernanceStage", () => {
    expect(isOwnerGovernanceStage(2)).toBe(false);
    expect(isOwnerGovernanceStage(3)).toBe(true);
    expect(isOwnerGovernanceStage(5)).toBe(true);
  });

  describe("handleConversionTelegramWebhook", () => {
    const db = {
      conversionMessageDraft: {
        findUnique: vi.fn(),
        update: vi.fn(),
      },
    } as unknown as import("@prisma/client").PrismaClient;

    beforeEach(() => {
      vi.clearAllMocks();
    });

    it("reject sets rejected", async () => {
      const draft = {
        id: "d1",
        status: CONVERSION_DRAFT_STATUS.AWAITING_OWNER,
      };
      (db.conversionMessageDraft.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(draft);
      (db.conversionMessageDraft.update as ReturnType<typeof vi.fn>).mockResolvedValue({});

      const body = {
        callback_query: { id: "cq1", data: "reject_draft:d1", from: { id: 1, username: "owner" } },
      };
      const r = await handleConversionTelegramWebhook(db, env, body);
      expect(r.ok).toBe(true);
      expect(db.conversionMessageDraft.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "d1" },
          data: expect.objectContaining({ status: CONVERSION_DRAFT_STATUS.REJECTED }),
        }),
      );
    });
  });
});
