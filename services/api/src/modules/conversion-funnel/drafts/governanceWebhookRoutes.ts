import type { Env } from "@mywave/config";
import { Router, Request, Response } from "express";
import { prisma } from "../../../lib/prisma";
import { handleConversionTelegramWebhook } from "./draftService";

/**
 * Webhook Telegram для owner approval (inline callback).
 * URL: POST /public/conversion-funnel/governance/:webhookSecret/telegram
 * В Telegram Bot API: setWebhook с тем же secret в path (или вынести за reverse proxy).
 */
export function conversionGovernanceWebhookRoutes(env: Env): Router {
  const router = Router();

  router.post("/:webhookSecret/telegram", async (req: Request, res: Response) => {
    const expected = env.CONVERSION_TELEGRAM_WEBHOOK_SECRET?.trim();
    const got = typeof req.params.webhookSecret === "string" ? req.params.webhookSecret.trim() : "";
    if (!expected || got !== expected) {
      res.status(404).end();
      return;
    }
    try {
      await handleConversionTelegramWebhook(prisma, env, req.body);
      res.json({ ok: true });
    } catch (e) {
      console.error("[conversion-governance] webhook", e instanceof Error ? e.message : e);
      res.status(400).json({ error: "webhook_failed" });
    }
  });

  return router;
}
