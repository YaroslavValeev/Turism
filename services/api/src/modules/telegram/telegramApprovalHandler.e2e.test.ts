import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@mywave/config", () => ({
  buildTelegramFileApiUrl: vi.fn(() => null),
}));

vi.mock("./telegramApi", () => ({
  callTelegramJson: vi.fn(async () => ({ ok: true })),
  resolveContentOwnerChatId: vi.fn(() => "123"),
}));

vi.mock("../../lib/proxyFetch", () => ({ proxyFetch: vi.fn() }));

vi.mock("./operatorMenu", () => ({
  handleTelegramOperatorCallback: vi.fn(async () => false),
  isTelegramOperator: vi.fn(() => true),
  sendTelegramOperatorMenu: vi.fn(async () => {}),
}));

vi.mock("../organizer-outreach/service", () => ({
  approveAndSendOutreachCampaign: vi.fn(async () => ({ ok: true })),
  skipOutreachCampaign: vi.fn(async () => ({ ok: true })),
  declineOutreachCampaign: vi.fn(async () => ({ ok: true })),
}));

vi.mock("../content-pipeline/approval.service", () => ({
  parseCallbackData: vi.fn((data: string) => {
    const [a, id] = data.split("|");
    if (!a || !id) return null;
    const map: Record<string, string> = { P: "publish", W: "rewrite", X: "reject", K: "skip" };
    const action = map[a];
    return action ? { action, draftId: id } : null;
  }),
  handleApprovalDecision: vi.fn(async () => ({ ok: true })),
  requestRewrite: vi.fn(async () => {}),
  applyRewrite: vi.fn(async () => ({ ok: true, newDraftId: "d2" })),
  sendDraftToOwner: vi.fn(async () => ({ ok: true })),
}));

vi.mock("./transcribeVoice", () => ({
  transcribeOggOrMp3: vi.fn(async () => "перепиши покороче"),
}));

vi.mock("../../lib/prisma", () => ({
  prisma: {
    contentItem: {
      findFirst: vi.fn(async () => ({
        id: "ci1",
        workflowStatus: "rewrite_requested",
        ownerReviewAwaitingDraftId: "d1",
        ownerReviewAwaitingDraft: { id: "d1", telegramPreviewChatId: "123" },
      })),
    },
  },
}));

import { handleTelegramContentPipelineUpdate } from "./telegramApprovalHandler";
import { applyRewrite, handleApprovalDecision, requestRewrite } from "../content-pipeline/approval.service";
import { sendTelegramOperatorMenu } from "./operatorMenu";

const env = {
  TELEGRAM_API_BASE_URL: "https://api.telegram.org",
  TELEGRAM_BOT_TOKEN: "TOKEN",
  TELEGRAM_CONTENT_OWNER_CHAT_ID: "123",
  TELEGRAM_ALERT_CHAT_ID: "123",
} as unknown as import("@mywave/config").Env;

describe("telegram owner review e2e-ish", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("approve callback -> decision approved", async () => {
    await handleTelegramContentPipelineUpdate(env, {
      update_id: 1,
      callback_query: {
        id: "cb1",
        from: { id: 42 },
        message: { message_id: 10, chat: { id: 123 } },
        data: "P|draft1",
      },
    });
    expect(handleApprovalDecision).toHaveBeenCalledWith(
      expect.objectContaining({ decision: "approved", contentDraftId: "draft1", callbackId: "cb1" }),
    );
  });

  it("reject callback -> decision rejected", async () => {
    await handleTelegramContentPipelineUpdate(env, {
      update_id: 2,
      callback_query: {
        id: "cb2",
        from: { id: 42 },
        message: { message_id: 10, chat: { id: 123 } },
        data: "X|draft1",
      },
    });
    expect(handleApprovalDecision).toHaveBeenCalledWith(
      expect.objectContaining({ decision: "rejected", contentDraftId: "draft1", callbackId: "cb2" }),
    );
  });

  it("rewrite callback -> requestRewrite called", async () => {
    await handleTelegramContentPipelineUpdate(env, {
      update_id: 3,
      callback_query: {
        id: "cb3",
        from: { id: 42 },
        message: { message_id: 10, chat: { id: 123 } },
        data: "W|draft1",
      },
    });
    expect(handleApprovalDecision).toHaveBeenCalledWith(expect.objectContaining({ decision: "rewrite_requested" }));
    expect(requestRewrite).toHaveBeenCalledWith(env, "draft1");
  });

  it("rewrite text message -> new version flow", async () => {
    await handleTelegramContentPipelineUpdate(env, {
      update_id: 4,
      message: { message_id: 11, from: { id: 42 }, chat: { id: 123 }, text: "сделай короче" },
    });
    expect(applyRewrite).toHaveBeenCalledWith(
      env,
      expect.objectContaining({ parentDraftId: "d1", text: "сделай короче" }),
    );
  });

  it("/ops opens the protected operator menu", async () => {
    await handleTelegramContentPipelineUpdate(env, {
      update_id: 5,
      message: { message_id: 12, from: { id: 42 }, chat: { id: 123 }, text: "/ops" },
    });
    expect(sendTelegramOperatorMenu).toHaveBeenCalledWith(env, 123);
  });
});

