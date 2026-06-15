import { Router, type Request, type Response } from "express";
import type { Env } from "@mywave/config";
import { handleTelegramContentPipelineUpdate, type TelegramUpdate } from "./telegramApprovalHandler";
import { handleTelegramPlatformUpdate } from "../telegram-platform/webhookHandler";

function getHeaderSecret(req: Request): string {
  const v = req.header("x-telegram-bot-api-secret-token") ?? "";
  return v.trim();
}

/**
 * Единый ingress для bot token (webhook).
 * Диспетчер внутри API: content-pipeline + platform leadgen.
 */
export function telegramUnifiedWebhookRoutes(env: Env): Router {
  const router = Router();
  const expected = (env.TELEGRAM_WEBHOOK_SECRET ?? "").trim();

  router.post("/webhook", async (req: Request, res: Response) => {
    // В production секрет обязателен; в local/staging может быть пустым для быстрой отладки.
    if (expected && getHeaderSecret(req) !== expected) {
      res.status(401).json({ ok: false });
      return;
    }

    const update = req.body as TelegramUpdate;

    // 1) Сначала пробуем content-pipeline (owner approve / outreach approve).
    // Этот обработчик сам «отсекает» не-owner чаты.
    const content = await handleTelegramContentPipelineUpdate(env, update).catch((e) => {
      console.error("[telegram-webhook] content-pipeline handler failed", e);
      return { ok: false as const, error: "content_handler_failed" };
    });

    // 2) Затем platform leadgen flow (если content pipeline не обработал/не применим).
    // Даже если content pipeline вернул unauthorized — это не ошибка для webhook.
    const platform = await handleTelegramPlatformUpdate(env, update).catch((e) => {
      console.error("[telegram-webhook] platform handler failed", e);
      return { ok: false as const, error: "platform_handler_failed" };
    });

    res.json({ ok: true, contentOk: content.ok, platformOk: platform.ok });
  });

  return router;
}

