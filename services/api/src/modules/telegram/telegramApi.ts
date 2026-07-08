import type { Env } from "@mywave/config";

type TelegramResponse<T> = { ok: boolean; result?: T; description?: string };

/**
 * Синхронный JSON API Telegram Bot.
 * Поддерживает legacy base `https://api.telegram.org/bot<TOKEN>` и канон:
 * `TELEGRAM_BOT_API_BASE_URL=https://api.telegram.org` + `TELEGRAM_BOT_TOKEN`.
 */
export function buildTelegramMethodUrl(env: Env, method: string): string | null {
  const e = env as Env & { TELEGRAM_BOT_TOKEN?: string };
  const base = env.TELEGRAM_BOT_API_BASE_URL?.replace(/\/+$/, "");
  if (!base) return null;
  if (/\/bot[^/]+$/.test(base)) return `${base}/${method}`;
  const token = e.TELEGRAM_BOT_TOKEN?.trim();
  if (!token) return null;
  return `${base}/bot${token}/${method}`;
}

export function buildTelegramFileUrl(env: Env, filePath: string): string | null {
  const e = env as Env & { TELEGRAM_BOT_TOKEN?: string };
  const base = env.TELEGRAM_BOT_API_BASE_URL?.replace(/\/+$/, "");
  const token = e.TELEGRAM_BOT_TOKEN?.trim() || base?.match(/\/bot([^/]+)$/)?.[1];
  if (!token) return null;
  return `https://api.telegram.org/file/bot${token}/${filePath}`;
}

export async function callTelegramJson<T = unknown>(env: Env, method: string, body: Record<string, unknown>): Promise<TelegramResponse<T>> {
  const url = buildTelegramMethodUrl(env, method);
  if (!url) {
    return { ok: false, description: "Telegram Bot API env not set" };
  }
  const r = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return (await r.json()) as TelegramResponse<T>;
}

export function resolveContentOwnerChatId(env: Env): string | null {
  return env.TELEGRAM_CONTENT_OWNER_CHAT_ID?.trim() || env.TELEGRAM_ALERT_CHAT_ID?.trim() || null;
}
