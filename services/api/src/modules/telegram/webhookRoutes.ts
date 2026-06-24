import { Router, Request, Response } from "express";
import type { Env } from "@mywave/config";
import { handleTelegramContentPipelineUpdate, type TelegramUpdate } from "./telegramApprovalHandler";
import { handleTelegramPlatformUpdate } from "../telegram-platform/webhookHandler";

export type TelegramWebhookDispatchResult = {
  handledBy: "telegram-platform" | "content-pipeline" | "ignored";
  ok: boolean;
  error?: string;
};

function readWebhookSecret(env: Env): string {
  return ((env as Env & { TELEGRAM_WEBHOOK_SECRET?: string }).TELEGRAM_WEBHOOK_SECRET ?? "").trim();
}

function updateLooksLikePlatformLeadgen(update: TelegramUpdate): boolean {
  const data = update.callback_query?.data?.trim() ?? "";
  if (data.startsWith("mtlead:") || data.startsWith("mtops:")) return true;

  const text = update.message?.text?.trim() ?? "";
  return (
    text.startsWith("/start lead_") ||
    text.startsWith("/start mtlead_") ||
    text.startsWith("/lead ") ||
    text.startsWith("lead:")
  );
}

/**
 * Единый dispatcher для одного production bot token → одного webhook ingress.
 * Platform leadgen updates обрабатываются первыми, всё остальное отдаётся старому
 * content-pipeline handler, чтобы не создавать второй независимый Telegram bot.
 */
export async function dispatchTelegramWebhookUpdate(env: Env, update: TelegramUpdate): Promise<TelegramWebhookDispatchResult> {
  if (updateLooksLikePlatformLeadgen(update)) {
    const out = await handleTelegramPlatformUpdate(env, update);
    return { handledBy: "telegram-platform", ...out };
  }

  const out = await handleTelegramContentPipelineUpdate(env, update);
  return { handledBy: "content-pipeline", ...out };
}

export function telegramWebhookRoutes(env: Env): Router {
  const router = Router();

  router.post("/webhook", (req: Request, res: Response) => {
    const expectedSecret = readWebhookSecret(env);
    if (!expectedSecret) {
      res.status(503).json({ ok: false, error: "TELEGRAM_WEBHOOK_SECRET not set" });
      return;
    }

    const actualSecret = String(req.header("X-Telegram-Bot-Api-Secret-Token") ?? "");
    if (actualSecret !== expectedSecret) {
      res.status(401).json({ ok: false, error: "invalid telegram webhook secret" });
      return;
    }

    void dispatchTelegramWebhookUpdate(env, req.body as TelegramUpdate)
      .then((out) => {
        if (!out.ok) {
          console.warn("[telegram-webhook-dispatcher]", out.handledBy, out.error);
        }
        res.json({ ok: true, handledBy: out.handledBy });
      })
      .catch((e) => {
        console.error("[telegram-webhook-dispatcher]", e);
        res.status(500).json({ ok: false });
      });
  });

  return router;
}
