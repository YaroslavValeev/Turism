import type { Env } from "@mywave/config";
import { Router, type Request, type Response } from "express";
import { safeError } from "../../lib/safeLogger";
import { handleTelegramPlatformUpdate, type TelegramUpdate } from "../telegram-platform/webhookHandler";
import { handleTelegramContentPipelineUpdate } from "./telegramApprovalHandler";

type DispatchResult = {
  contentOk: boolean;
  platformOk: boolean;
};

function headerSecret(req: Request): string {
  return (req.header("x-telegram-bot-api-secret-token") ?? "").trim();
}

export function isWebhookSecretAccepted(expected: string | undefined, received: string | undefined): boolean {
  const configured = expected?.trim() ?? "";
  return configured.length > 0 && (received?.trim() ?? "") === configured;
}

export async function dispatchTelegramWebhookUpdate(env: Env, update: TelegramUpdate): Promise<DispatchResult> {
  const content = await handleTelegramContentPipelineUpdate(env, update).catch((error) => {
    safeError("[telegram-webhook] content-pipeline handler failed", error);
    return { ok: false as const };
  });

  const platform = await handleTelegramPlatformUpdate(env, update).catch((error) => {
    safeError("[telegram-webhook] platform handler failed", error);
    return { ok: false as const };
  });

  return { contentOk: content.ok, platformOk: platform.ok };
}

/** Single Telegram Bot API webhook shared by content approval and Tour leadgen. */
export function telegramUnifiedWebhookRoutes(env: Env): Router {
  const router = Router();

  router.post("/webhook", async (req: Request, res: Response) => {
    const expected = env.TELEGRAM_WEBHOOK_SECRET?.trim();
    if (!expected) {
      res.status(503).json({ ok: false, error: "webhook_not_configured" });
      return;
    }
    if (!isWebhookSecretAccepted(expected, headerSecret(req))) {
      res.status(401).json({ ok: false });
      return;
    }

    const result = await dispatchTelegramWebhookUpdate(env, req.body as TelegramUpdate);
    res.json({ ok: true, ...result });
  });

  return router;
}
