import { describe, expect, it, vi } from "vitest";

vi.mock("../../lib/prisma", () => ({
  prisma: {
    processedTelegramCallback: {
      findUnique: vi.fn(async () => ({ id: "cb-dup" })),
      create: vi.fn(async () => ({})),
    },
    contentDraft: { findUnique: vi.fn() },
  },
}));

import { handleApprovalDecision } from "./approval.service";

describe("duplicate callback protection", () => {
  it("returns duplicate and does not process decision twice", async () => {
    const out = await handleApprovalDecision({
      contentDraftId: "draft1",
      decision: "approved",
      decidedBy: "tg:1",
      callbackId: "cb-dup",
      source: "telegram",
    });
    expect(out).toEqual({ ok: true, duplicate: true });
  });
});

