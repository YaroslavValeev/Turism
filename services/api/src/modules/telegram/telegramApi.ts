import type { Env } from "@mywave/config";

type TelegramResponse<T> = { ok: boolean; result?: T; description?: string };

/**
 * Синхронный JSON API Telegram Bot. База URL: `TELEGRAM_BOT_API_BASE_URL` (…/bot&lt;token&gt;).
 */
export async function callTelegramJson<T = unknown>(env: Env, method: string, body: Record<string, unknown>): Promise<TelegramResponse<T>> {
  const base = env.TELEGRAM_BOT_API_BASE_URL?.replace(/\/+$/, "");
  if (!base) {
    return { ok: false, description: "TELEGRAM_BOT_API_BASE_URL not set" };
  }
  const url = `${base}/${method}`;
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
