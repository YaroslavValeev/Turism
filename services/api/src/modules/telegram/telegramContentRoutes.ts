import { Router, Request, Response } from "express";
import type { Env } from "@mywave/config";
import { handleTelegramContentPipelineUpdate, type TelegramUpdate } from "./telegramApprovalHandler";

/**
 * `POST /public/telegram/content-pipeline/:token` — вебхук Bot API
 * (установить: `setWebhook?url=...&secret_token=...` при необходимости).
 */
export function telegramContentPipelineRoutes(env: Env): Router {
  const router = Router();
  const expect = (env as Env & { CONTENT_PIPELINE_TELEGRAM_WEBHOOK_TOKEN?: string }).CONTENT_PIPELINE_TELEGRAM_WEBHOOK_TOKEN?.trim();

  router.post("/content-pipeline/:token", (req: Request, res: Response) => {
    if (!expect) {
      res.status(503).json({ error: "CONTENT_PIPELINE_TELEGRAM_WEBHOOK_TOKEN not set" });
      return;
    }
    if (String(req.params.token) !== expect) {
      res.status(404).end();
      return;
    }
    const body = req.body as TelegramUpdate;
    void handleTelegramContentPipelineUpdate(env, body)
      .then((out) => {
        if (!out.ok) {
          console.warn("[content-pipeline-telegram]", out.error);
        }
        res.json({ ok: true });
      })
      .catch((e) => {
        console.error("[content-pipeline-telegram]", e);
        res.status(500).json({ ok: false });
      });
  });

  return router;
}
