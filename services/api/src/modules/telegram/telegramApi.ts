import {
  buildTelegramBotApiUrl,
  isTelegramBotApiConfigured,
  type Env,
} from "@mywave/config";
import { proxyAwareFetch } from "../../lib/proxyFetch";

type TelegramResponse<T> = { ok: boolean; result?: T; description?: string };

/**
 * Синхронный JSON API Telegram Bot через канонические origin + token env.
 * Исходящий трафик при необходимости через `TELEGRAM_BOT_HTTP_PROXY` (socks5 → EU).
 */
export async function callTelegramJson<T = unknown>(
  env: Env,
  method: string,
  body: Record<string, unknown>,
): Promise<TelegramResponse<T>> {
  try {
    const url = buildTelegramBotApiUrl(env, method);
    if (!url) {
      return { ok: false, description: "Telegram Bot API is not configured" };
    }
    const r = await proxyAwareFetch(
      url,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      },
      env.TELEGRAM_BOT_HTTP_PROXY,
    );
    return (await r.json()) as TelegramResponse<T>;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(
      JSON.stringify({
        event: "telegram_api_fetch_failed",
        method,
        proxyConfigured: Boolean(env.TELEGRAM_BOT_HTTP_PROXY?.trim()),
        error: message,
      }),
    );
    return { ok: false, description: `telegram fetch failed: ${message}` };
  }
}

export function resolveContentOwnerChatId(env: Env): string | null {
  return env.TELEGRAM_CONTENT_OWNER_CHAT_ID?.trim() || env.TELEGRAM_ALERT_CHAT_ID?.trim() || null;
}

export { isTelegramBotApiConfigured };
