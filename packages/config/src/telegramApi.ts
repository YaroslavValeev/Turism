export const DEFAULT_TELEGRAM_API_BASE_URL = "https://api.telegram.org";

export type TelegramApiEnv = {
  TELEGRAM_API_BASE_URL?: string;
  TELEGRAM_BOT_TOKEN?: string;
  /** @deprecated Secret-bearing compatibility fallback. Prefer TELEGRAM_API_BASE_URL + TELEGRAM_BOT_TOKEN. */
  TELEGRAM_BOT_API_BASE_URL?: string;
};

function trim(value: string | undefined): string | undefined {
  const normalized = value?.trim();
  return normalized || undefined;
}

function normalizeOrigin(value: string): string {
  const parsed = new URL(value);
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    throw new Error("TELEGRAM_API_BASE_URL must use http or https");
  }
  if (parsed.username || parsed.password || parsed.search || parsed.hash) {
    throw new Error("TELEGRAM_API_BASE_URL must not contain credentials, query, or fragment");
  }
  if (parsed.pathname !== "/" && parsed.pathname !== "") {
    throw new Error("TELEGRAM_API_BASE_URL must be an origin without a path");
  }
  return parsed.origin;
}

export function resolveTelegramApiOrigin(env: TelegramApiEnv): string {
  return normalizeOrigin(trim(env.TELEGRAM_API_BASE_URL) ?? DEFAULT_TELEGRAM_API_BASE_URL);
}

export function resolveTelegramBotApiBaseUrl(env: TelegramApiEnv): string | undefined {
  const token = trim(env.TELEGRAM_BOT_TOKEN);
  const canonicalOrigin = trim(env.TELEGRAM_API_BASE_URL);
  const legacy = trim(env.TELEGRAM_BOT_API_BASE_URL)?.replace(/\/+$/, "");

  if (canonicalOrigin && !token) {
    throw new Error("TELEGRAM_BOT_TOKEN is required with TELEGRAM_API_BASE_URL");
  }
  if (token) {
    const canonical = `${resolveTelegramApiOrigin(env)}/bot${token}`;
    if (legacy && legacy !== canonical) {
      throw new Error("Canonical and legacy Telegram Bot API credentials conflict");
    }
    return canonical;
  }

  return legacy;
}

export function isTelegramBotApiConfigured(env: TelegramApiEnv): boolean {
  return Boolean(resolveTelegramBotApiBaseUrl(env));
}

export function buildTelegramBotApiUrl(env: TelegramApiEnv, method: string): string | undefined {
  const base = resolveTelegramBotApiBaseUrl(env);
  const normalizedMethod = method.trim().replace(/^\/+/, "");
  if (!base || !normalizedMethod) return undefined;
  return `${base}/${normalizedMethod}`;
}

export function buildTelegramFileApiUrl(env: TelegramApiEnv, filePath: string): string | undefined {
  const normalizedPath = filePath.trim().replace(/^\/+/, "");
  if (!normalizedPath) return undefined;

  const token = trim(env.TELEGRAM_BOT_TOKEN);
  if (token) {
    return `${resolveTelegramApiOrigin(env)}/file/bot${token}/${normalizedPath}`;
  }

  const legacy = trim(env.TELEGRAM_BOT_API_BASE_URL)?.replace(/\/+$/, "");
  const match = legacy?.match(/^(.*)\/bot([^/]+)$/);
  if (!match) return undefined;
  return `${match[1]}/file/bot${match[2]}/${normalizedPath}`;
}
