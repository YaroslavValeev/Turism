import { Router, Request, Response } from "express";
import type { Env } from "@mywave/config";
import { handleTelegramContentPipelineUpdate, type TelegramUpdate } from "./telegramApprovalHandler";

/**
 * Вебхуки Bot API:
 * - `POST /public/telegram/webhook` — production relay (secret header, Cloudflare tunnel)
 * - `POST /public/telegram/content-pipeline/:token` — legacy path-token
 */
export function telegramContentPipelineRoutes(env: Env): Router {
  const router = Router();
  const pathToken = env.CONTENT_PIPELINE_TELEGRAM_WEBHOOK_TOKEN?.trim();
  const headerSecret = (
    env.TELEGRAM_WEBHOOK_SECRET ??
    process.env.TELEGRAM_WEBHOOK_SECRET ??
    ""
  ).trim();

  function acceptUpdate(req: Request, res: Response, logTag: string): void {
    const body = req.body as TelegramUpdate;
    void handleTelegramContentPipelineUpdate(env, body)
      .then((out) => {
        if (!out.ok) {
          console.warn(`[${logTag}]`, out.error);
        }
        res.json({ ok: true });
      })
      .catch((e) => {
        console.error(`[${logTag}]`, e);
        res.status(500).json({ ok: false });
      });
  }

  /** EU Cloudflare → api-bridge → этот путь (см. tourism-telegram-relay webhook_repair). */
  router.post("/webhook", (req: Request, res: Response) => {
    if (!headerSecret) {
      res.status(503).json({ error: "TELEGRAM_WEBHOOK_SECRET not set" });
      return;
    }
    const got = String(req.header("X-Telegram-Bot-Api-Secret-Token") ?? "");
    if (got !== headerSecret) {
      res.status(404).end();
      return;
    }
    acceptUpdate(req, res, "telegram-webhook");
  });

  router.post("/content-pipeline/:token", (req: Request, res: Response) => {
    if (!pathToken) {
      res.status(503).json({ error: "CONTENT_PIPELINE_TELEGRAM_WEBHOOK_TOKEN not set" });
      return;
    }
    if (String(req.params.token) !== pathToken) {
      res.status(404).end();
      return;
    }
    acceptUpdate(req, res, "content-pipeline-telegram");
  });

  return router;
}
