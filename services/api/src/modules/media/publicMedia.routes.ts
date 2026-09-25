import { Router, type Request, type Response } from "express";
import { proxyAwareFetch } from "../../lib/proxyFetch";

function isBlockedPrivateHost(hostname: string): boolean {
  const host = hostname.toLowerCase();
  if (host === "localhost" || host === "127.0.0.1" || host === "::1") return true;
  if (host.endsWith(".local")) return true;
  if (host.startsWith("10.")) return true;
  if (host.startsWith("192.168.")) return true;
  if (/^172\.(1[6-9]|2\d|3[0-1])\./.test(host)) return true;
  return false;
}

function isTelegramCdnHost(hostname: string): boolean {
  const host = hostname.toLowerCase();
  return (
    host.includes("telesco.pe") ||
    host.includes("telegram.org") ||
    host.includes("t.me") ||
    host.includes("cdn-telegram.org")
  );
}

function buildReferer(url: URL): string {
  const host = url.hostname.toLowerCase();
  if (host.includes("instagram.com") || host.includes("cdninstagram.com") || host.includes("fbcdn.net")) {
    return "https://www.instagram.com/";
  }
  if (isTelegramCdnHost(host)) return "https://t.me/";
  return `${url.protocol}//${url.hostname}/`;
}

/**
 * GET /public/media?url=https://...
 * Проксирует картинки/видео (Telegram CDN — через TELEGRAM_BOT_HTTP_PROXY).
 */
export function publicMediaRoutes(): Router {
  const router = Router();

  router.get("/media", async (req: Request, res: Response) => {
    const remoteUrl = String(req.query.url ?? "").trim();
    if (!remoteUrl) {
      res.status(400).json({ error: "Missing url" });
      return;
    }

    let parsed: URL;
    try {
      parsed = new URL(remoteUrl.startsWith("//") ? `https:${remoteUrl}` : remoteUrl);
    } catch {
      res.status(400).json({ error: "Invalid url" });
      return;
    }

    if (!["http:", "https:"].includes(parsed.protocol) || isBlockedPrivateHost(parsed.hostname)) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }

    const proxy = process.env.TELEGRAM_BOT_HTTP_PROXY?.trim() || null;
    const useSocks = Boolean(proxy) && isTelegramCdnHost(parsed.hostname);

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
          signal: AbortSignal.timeout(45000),
        },
        useSocks ? proxy : null,
      );

      if (!upstream.ok) {
        res.status(502).json({ error: "Upstream media failed", status: upstream.status });
        return;
      }

      const contentType = upstream.headers.get("content-type") ?? "application/octet-stream";
      const buffer = Buffer.from(await upstream.arrayBuffer());
      res.setHeader("content-type", contentType);
      res.setHeader("cache-control", "public, max-age=3600");
      res.status(200).send(buffer);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      res.status(502).json({ error: "Media proxy failed", detail: message });
    }
  });

  return router;
}
