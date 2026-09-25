import type { Env } from "@mywave/config";
import { proxyAwareFetch } from "../../lib/proxyFetch";

type TelegramResponse<T> = { ok: boolean; result?: T; description?: string };

/**
 * Синхронный JSON API Telegram Bot. База URL: `TELEGRAM_BOT_API_BASE_URL` (…/bot&lt;token&gt;).
 * Исходящий трафик при необходимости через `TELEGRAM_BOT_HTTP_PROXY` (socks5 → EU).
 */
export async function callTelegramJson<T = unknown>(
  env: Env,
  method: string,
  body: Record<string, unknown>,
): Promise<TelegramResponse<T>> {
  const base = env.TELEGRAM_BOT_API_BASE_URL?.replace(/\/+$/, "");
  if (!base) {
    return { ok: false, description: "TELEGRAM_BOT_API_BASE_URL not set" };
  }
  const url = `${base}/${method}`;
  try {
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
