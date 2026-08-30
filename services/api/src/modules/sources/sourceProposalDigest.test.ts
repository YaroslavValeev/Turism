import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findDigest: vi.fn(),
  findPending: vi.fn(),
  createAudit: vi.fn(),
  callTelegramJson: vi.fn(),
}));

vi.mock("../../lib/prisma", () => ({
  prisma: {
    auditLog: { findFirst: mocks.findDigest, create: mocks.createAudit },
    sourceProposal: { findMany: mocks.findPending },
  },
}));
vi.mock("../telegram/telegramApi", () => ({
  callTelegramJson: mocks.callTelegramJson,
  isTelegramBotApiConfigured: vi.fn(() => true),
  resolveContentOwnerChatId: vi.fn(() => "-100123"),
}));

import { formatSourceProposalDigest, sendPendingSourceProposalDigest } from "./sourceProposalDigest";

const env = {} as import("@mywave/config").Env;
const proposal = {
  id: "proposal-1",
  normalizedUrl: "https://t.me/wakesurf_camp",
  detectedType: "telegram",
  displayName: "Wakesurf Camp",
  organizerName: null,
};

describe("source proposal daily digest", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.findDigest.mockResolvedValue(null);
    mocks.findPending.mockResolvedValue([proposal]);
    mocks.callTelegramJson.mockResolvedValue({ ok: true });
    mocks.createAudit.mockResolvedValue({ id: "audit-1" });
  });

  it("formats a safe owner-only review message", () => {
    const text = formatSourceProposalDigest([{ ...proposal, organizerName: "  Организатор\nлагеря " }]);
    expect(text).toContain("Организатор лагеря · telegram");
    expect(text).toContain("https://t.me/wakesurf_camp");
    expect(text).toContain("неактивный источник");
  });

  it("sends one pending-proposal digest and records its daily idempotency key", async () => {
    await expect(sendPendingSourceProposalDigest(env, new Date("2026-08-30T12:00:00.000Z"))).resolves.toEqual({
      status: "sent",
      proposalIds: ["proposal-1"],
    });
    expect(mocks.callTelegramJson).toHaveBeenCalledWith(env, "sendMessage", expect.objectContaining({
      chat_id: "-100123",
      disable_web_page_preview: true,
    }));
    expect(mocks.createAudit).toHaveBeenCalledWith({
      data: expect.objectContaining({
        entityType: "source_proposal_digest",
        entityId: "2026-08-30",
        changedField: "sent",
        newValue: '["proposal-1"]',
      }),
    });
  });

  it("does not send a duplicate digest on the same day", async () => {
    mocks.findDigest.mockResolvedValue({ id: "already-sent" });
    await expect(sendPendingSourceProposalDigest(env, new Date("2026-08-30T12:00:00.000Z"))).resolves.toEqual({
      status: "skipped",
      reason: "already_sent_today",
    });
    expect(mocks.findPending).not.toHaveBeenCalled();
    expect(mocks.callTelegramJson).not.toHaveBeenCalled();
  });
});
