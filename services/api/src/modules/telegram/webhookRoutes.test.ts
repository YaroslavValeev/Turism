import { describe, expect, it, vi } from "vitest";
import type { Env } from "@mywave/config";
import { dispatchTelegramWebhookUpdate } from "./webhookRoutes";

vi.mock("./telegramApprovalHandler", async () => ({
  handleTelegramContentPipelineUpdate: vi.fn(async () => ({ ok: true })),
}));
vi.mock("../telegram-platform/webhookHandler", () => ({
  handleTelegramPlatformUpdate: vi.fn(async () => ({ ok: true })),
}));

const env = {} as Env;

describe("dispatchTelegramWebhookUpdate", () => {
  it("routes platform lead deep-links to telegram-platform handler", async () => {
    const out = await dispatchTelegramWebhookUpdate(env, {
      update_id: 1,
      message: { message_id: 1, chat: { id: 510686579 }, text: "/start lead_realProgramId" },
    });

    expect(out).toEqual({ ok: true, handledBy: "telegram-platform" });
  });

  it("routes legacy content-pipeline callbacks to the existing content handler", async () => {
    const out = await dispatchTelegramWebhookUpdate(env, {
      update_id: 2,
      callback_query: { id: "cb", from: { id: 510686579 }, data: "approve:realDraft" },
    });

    expect(out).toEqual({ ok: true, handledBy: "content-pipeline" });
  });
});
