import type { Env } from "@mywave/config";
import express from "express";
import type { AddressInfo } from "node:net";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { dispatchTelegramWebhookUpdate, isWebhookSecretAccepted } from "./webhookRoutes";
import { handleTelegramContentPipelineUpdate } from "./telegramApprovalHandler";
import { handleTelegramPlatformUpdate } from "../telegram-platform/webhookHandler";

vi.mock("./telegramApprovalHandler", () => ({
  handleTelegramContentPipelineUpdate: vi.fn(),
}));
vi.mock("../telegram-platform/webhookHandler", () => ({
  handleTelegramPlatformUpdate: vi.fn(),
}));

const env = {} as Env;

async function postWebhook(testEnv: Env, secret?: string) {
  const app = express();
  app.use(express.json());
  app.use("/public/telegram", (await import("./webhookRoutes")).telegramUnifiedWebhookRoutes(testEnv));
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", resolve));

  try {
    const { port } = server.address() as AddressInfo;
    return await fetch(`http://127.0.0.1:${port}/public/telegram/webhook`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(secret ? { "x-telegram-bot-api-secret-token": secret } : {}),
      },
      body: JSON.stringify({ update_id: 3 }),
    });
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
}

describe("Telegram unified webhook", () => {
  beforeEach(() => {
    vi.mocked(handleTelegramContentPipelineUpdate).mockResolvedValue({ ok: true });
    vi.mocked(handleTelegramPlatformUpdate).mockResolvedValue({ ok: true });
  });

  it("fails closed when the webhook secret is missing or wrong", () => {
    expect(isWebhookSecretAccepted(undefined, undefined)).toBe(false);
    expect(isWebhookSecretAccepted("expected", "wrong")).toBe(false);
    expect(isWebhookSecretAccepted("expected", "expected")).toBe(true);
  });

  it("enforces the secret at the HTTP boundary", async () => {
    const missing = await postWebhook(env, "anything");
    expect(missing.status).toBe(503);

    const configured = { ...env, TELEGRAM_WEBHOOK_SECRET: "expected" };
    const wrong = await postWebhook(configured, "wrong");
    expect(wrong.status).toBe(401);

    const accepted = await postWebhook(configured, "expected");
    expect(accepted.status).toBe(200);
    await expect(accepted.json()).resolves.toEqual({ ok: true, contentOk: true, platformOk: true });
  });

  it("dispatches an update to both existing handlers", async () => {
    const update = {
      update_id: 1,
      message: { message_id: 1, chat: { id: 123456789 }, text: "/start" },
    };

    await expect(dispatchTelegramWebhookUpdate(env, update)).resolves.toEqual({
      contentOk: true,
      platformOk: true,
    });
    expect(handleTelegramContentPipelineUpdate).toHaveBeenCalledWith(env, update);
    expect(handleTelegramPlatformUpdate).toHaveBeenCalledWith(env, update);
  });

  it("isolates a failing handler so Telegram still receives HTTP 200", async () => {
    vi.mocked(handleTelegramContentPipelineUpdate).mockRejectedValue(new Error("content failure"));

    await expect(
      dispatchTelegramWebhookUpdate(env, {
        update_id: 2,
        message: { message_id: 2, chat: { id: 123456789 }, text: "/start" },
      }),
    ).resolves.toEqual({ contentOk: false, platformOk: true });
  });
});
