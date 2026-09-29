import { Router, type Request, type Response } from "express";
import { proxyAwareFetch } from "../../lib/proxyFetch";
import { instagramProxyForUrl } from "../ingestion/instagramProxy";
import {
  isAllowedMediaContentType,
  isTelegramMediaHost,
  PUBLIC_MEDIA_MAX_BYTES,
  resolvePublicMediaTarget,
} from "./publicMediaPolicy";

function buildReferer(url: URL): string {
  return isTelegramMediaHost(url.hostname) ? "https://t.me/" : "https://www.instagram.com/";
}

/**
 * GET /public/media?url=https://...
 * Проксирует картинки/видео только с CDN Telegram (через TELEGRAM_BOT_HTTP_PROXY) и Instagram (через INSTAGRAM_HTTP_PROXY).
 */
export function publicMediaRoutes(): Router {
  const router = Router();

  router.get("/media", async (req: Request, res: Response) => {
    const target = resolvePublicMediaTarget(req.query.url);
    if (!target.ok) {
      res.status(target.status).json({ error: target.error });
      return;
    }
    const parsed = target.url;

    const telegramProxy = process.env.TELEGRAM_BOT_HTTP_PROXY?.trim() || null;
    const upstreamProxy = isTelegramMediaHost(parsed.hostname) ? telegramProxy : instagramProxyForUrl(parsed.toString());

    try {
      const upstream = await proxyAwareFetch(
        parsed.toString(),
        {
          headers: {
            "user-agent":
              "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135 Safari/537.36",
            accept: "image/webp,image/avif,image/apng,image/*,video/webm,video/mp4,*/*;q=0.8",
            referer: buildReferer(parsed),
          },
          // Редирект мог бы увести с разрешённого CDN на произвольный хост.
          redirect: "manual",
          signal: AbortSignal.timeout(45000),
        },
        upstreamProxy,
      );

      if (!upstream.ok) {
        res.status(502).json({ error: "Upstream media failed", status: upstream.status });
        return;
      }

      const contentType = upstream.headers.get("content-type");
      if (!isAllowedMediaContentType(contentType)) {
        res.status(502).json({ error: "Upstream is not media" });
        return;
      }
      const declaredLength = Number(upstream.headers.get("content-length") ?? 0);
      if (declaredLength > PUBLIC_MEDIA_MAX_BYTES) {
        res.status(502).json({ error: "Upstream media too large" });
        return;
      }
      const buffer = Buffer.from(await upstream.arrayBuffer());
      if (buffer.length > PUBLIC_MEDIA_MAX_BYTES) {
        res.status(502).json({ error: "Upstream media too large" });
        return;
      }
      res.setHeader("content-type", String(contentType));
      res.setHeader("x-content-type-options", "nosniff");
      res.setHeader("cache-control", "public, max-age=3600");
      res.status(200).send(buffer);
    } catch {
      res.status(502).json({ error: "Media proxy failed" });
    }
  });

  return router;
}
