import { Router, type Request, type Response } from "express";
import type { Env } from "@mywave/config";
import { prisma } from "../../lib/prisma";
import { logTelegramPlatformEvent } from "../telegram-platform/events";
import { CHANNEL_CLICK_CHANNEL } from "./channelClicks";

const TOKEN_RE = /^[a-z0-9]{8,64}$/i;

/** GET /public/tg/c/:token — учёт клика по CTA поста канала и redirect на сохранённый адрес. */
export function publicTelegramClickRoutes(env: Env): Router {
  const router = Router();
  const fallbackUrl = env.PUBLIC_WEB_BASE_URL.replace(/\/+$/, "") || "/";

  router.get("/c/:token", async (req: Request, res: Response) => {
    const token = String(req.params.token ?? "");
    if (!TOKEN_RE.test(token)) {
      res.redirect(302, fallbackUrl);
      return;
    }

    const click = await prisma.telegramClick
      .findUnique({
        where: { token },
        select: { id: true, destinationUrl: true, programId: true, campaign: true, sourcePostId: true, clickedAt: true },
      })
      .catch(() => null);
    // Адрес пишет только наш код публикации, но redirect всё равно ограничен http(s), чтобы не стать open redirect.
    if (!click || !/^https?:\/\//i.test(click.destinationUrl)) {
      res.redirect(302, fallbackUrl);
      return;
    }

    if (!click.clickedAt) {
      await prisma.telegramClick
        .updateMany({ where: { id: click.id, clickedAt: null }, data: { clickedAt: new Date() } })
        .catch(() => undefined);
    }
    await logTelegramPlatformEvent({
      eventName: "channel_cta_clicked",
      programId: click.programId,
      source: CHANNEL_CLICK_CHANNEL,
      campaign: click.campaign,
      channelPostId: click.sourcePostId,
      properties: { first_click: !click.clickedAt },
    }).catch(() => undefined);

    res.setHeader("Cache-Control", "no-store");
    res.redirect(302, click.destinationUrl);
  });

  return router;
}
