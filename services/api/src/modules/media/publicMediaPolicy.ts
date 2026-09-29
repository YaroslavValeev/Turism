/**
 * /public/media — не открытый прокси: только CDN, откуда реально приходят медиа кандидатов
 * (Telegram, Instagram). Любой другой хост = SSRF-риск (внутренние адреса через DNS, чужой HTML с нашего домена).
 */
const TELEGRAM_CDN_SUFFIXES = ["telesco.pe", "cdn-telegram.org"];
const INSTAGRAM_CDN_SUFFIXES = ["cdninstagram.com", "fbcdn.net"];

export const PUBLIC_MEDIA_MAX_BYTES = 25 * 1024 * 1024;

function matchesSuffix(host: string, suffixes: readonly string[]): boolean {
  return suffixes.some((suffix) => host === suffix || host.endsWith(`.${suffix}`));
}

function normalizeHost(hostname: string): string {
  return hostname.toLowerCase().replace(/\.$/, "");
}

export function isTelegramMediaHost(hostname: string): boolean {
  const host = normalizeHost(hostname);
  if (matchesSuffix(host, TELEGRAM_CDN_SUFFIXES)) return true;
  if (host === "t.me" || host.endsWith(".t.me")) return true;
  return host.endsWith(".telegram.org") && !host.startsWith("api.");
}

export function isInstagramMediaHost(hostname: string): boolean {
  return matchesSuffix(normalizeHost(hostname), INSTAGRAM_CDN_SUFFIXES);
}

export type PublicMediaTarget = { ok: true; url: URL } | { ok: false; status: 400 | 403; error: string };

export function resolvePublicMediaTarget(raw: unknown): PublicMediaTarget {
  const value = String(raw ?? "").trim();
  if (!value) return { ok: false, status: 400, error: "Missing url" };
  let url: URL;
  try {
    url = new URL(value.startsWith("//") ? `https:${value}` : value);
  } catch {
    return { ok: false, status: 400, error: "Invalid url" };
  }
  if (url.protocol !== "https:" || url.username || url.password || (url.port && url.port !== "443")) {
    return { ok: false, status: 403, error: "Forbidden" };
  }
  if (!isTelegramMediaHost(url.hostname) && !isInstagramMediaHost(url.hostname)) {
    return { ok: false, status: 403, error: "Forbidden" };
  }
  return { ok: true, url };
}

/** SVG исключён: это документ со скриптами, а не картинка. */
export function isAllowedMediaContentType(contentType: string | null | undefined): boolean {
  const type = String(contentType ?? "").split(";")[0].trim().toLowerCase();
  if (type.startsWith("image/")) return !type.includes("svg");
  return type.startsWith("video/");
}
