/**
 * Кэш внешних медиа в apps/web/public/ingestion-media (shared volume с web).
 * Telegram CDN (telesco.pe) с Tourism VPS часто недоступен без SOCKS → proxyAwareFetch.
 */
import crypto from "crypto";
import fs from "fs/promises";
import path from "path";
import { proxyAwareFetch } from "../../lib/proxyFetch";
import { instagramProxyForUrl } from "./instagramProxy";

export const INGESTION_MEDIA_DIR = path.resolve(__dirname, "../../../../../apps/web/public/ingestion-media");
export const INGESTION_MEDIA_PREFIX = "/ingestion-media";

function normalizeText(value: string | null | undefined): string {
  return String(value ?? "").trim();
}

export function normalizeExternalMediaUrl(value: string | null | undefined): string | null {
  const normalized = normalizeText(value);
  if (!normalized) return null;
  if (normalized.startsWith("//")) return `https:${normalized}`;
  return normalized;
}

export function isRemoteMediaUrl(value: string | null | undefined): boolean {
  const normalized = normalizeExternalMediaUrl(value);
  if (!normalized) return false;
  try {
    const parsed = new URL(normalized);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
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

function inferMediaExtension(url: string, contentType: string | null): string {
  const normalizedType = (contentType ?? "").toLowerCase();
  if (normalizedType.includes("image/png")) return "png";
  if (normalizedType.includes("image/webp")) return "webp";
  if (normalizedType.includes("image/svg")) return "svg";
  if (normalizedType.includes("image/gif")) return "gif";
  if (normalizedType.includes("image/avif")) return "avif";
  if (normalizedType.includes("image/jpeg") || normalizedType.includes("image/jpg")) return "jpg";
  if (normalizedType.includes("video/webm")) return "webm";
  if (normalizedType.includes("video/quicktime")) return "mov";
  if (normalizedType.includes("video/mp4") || normalizedType.includes("video/")) return "mp4";

  try {
    const parsed = new URL(url);
    const ext = path.extname(parsed.pathname).replace(/^\./, "").toLowerCase();
    if (["jpg", "jpeg", "png", "webp", "svg", "gif", "avif", "mp4", "webm", "mov"].includes(ext)) {
      return ext === "jpeg" ? "jpg" : ext;
    }
  } catch {
    // ignore
  }

  return "jpg";
}

function isAllowedMediaContentType(contentType: string | null): boolean {
  if (!contentType) return true;
  const lower = contentType.toLowerCase();
  return lower.startsWith("image/") || lower.startsWith("video/") || lower.includes("octet-stream");
}

function buildReferer(url: string): string {
  const host = new URL(url).hostname.toLowerCase();
  if (host.includes("instagram.com") || host.includes("cdninstagram.com") || host.includes("fbcdn.net")) {
    return "https://www.instagram.com/";
  }
  if (isTelegramCdnHost(host)) {
    return "https://t.me/";
  }
  return `${new URL(url).protocol}//${host}/`;
}

function buildFilename(url: string, cacheKey: string, extension: string): string {
  const digest = crypto.createHash("sha256").update(url).digest("hex").slice(0, 16);
  const key =
    normalizeText(cacheKey)
      .replace(/[^a-z0-9_-]+/gi, "-")
      .replace(/^-+|-+$/g, "")
      .toLowerCase() || "asset";
  return `${key}-${digest}.${extension}`;
}

export async function cacheExternalProgramMediaForWeb(
  url: string | null | undefined,
  cacheKey: string,
): Promise<string | null> {
  const normalized = normalizeExternalMediaUrl(url);
  if (!normalized) return null;
  if (!isRemoteMediaUrl(normalized)) return normalized;

  await fs.mkdir(INGESTION_MEDIA_DIR, { recursive: true });

  const referer = buildReferer(normalized);
  const proxy = process.env.TELEGRAM_BOT_HTTP_PROXY?.trim() || null;
  let host = "";
  try {
    host = new URL(normalized).hostname;
  } catch {
    return null;
  }
  const mediaProxy = Boolean(proxy) && isTelegramCdnHost(host) ? proxy : instagramProxyForUrl(normalized);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 45000);

  try {
    const response = await proxyAwareFetch(
      normalized,
      {
        signal: controller.signal,
        headers: {
          "user-agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135 Safari/537.36",
          accept: "image/avif,image/webp,image/apng,image/*,video/webm,video/mp4,video/*,*/*;q=0.8",
          referer,
        },
      },
      mediaProxy,
    );

    if (!response.ok) return null;
    const contentType = response.headers.get("content-type");
    if (!isAllowedMediaContentType(contentType)) return null;

    const extension = inferMediaExtension(normalized, contentType);
    const filename = buildFilename(normalized, cacheKey, extension);
    const targetPath = path.join(INGESTION_MEDIA_DIR, filename);

    try {
      await fs.access(targetPath);
      return `${INGESTION_MEDIA_PREFIX}/${filename}`;
    } catch {
      // not cached yet
    }

    const body = Buffer.from(await response.arrayBuffer());
    if (!body.length) return null;
    await fs.writeFile(targetPath, body);
    return `${INGESTION_MEDIA_PREFIX}/${filename}`;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}
