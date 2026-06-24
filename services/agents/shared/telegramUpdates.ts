import axios from "axios";

function resolveToken(): string {
  return process.env.TG_BOT_TOKEN ?? process.env.TELEGRAM_BOT_TOKEN ?? "";
}

function buildTelegramUrl(method: string): string {
  const botToken = resolveToken();
  const base = process.env.TELEGRAM_BOT_API_BASE_URL?.replace(/\/$/, "");
  if (base?.match(/\/bot[^/]+$/)) return `${base}/${method}`;
  if (base && botToken) return `${base}/bot${botToken}/${method}`;
  return `https://api.telegram.org/bot${botToken}/${method}`;
}

export type TelegramInboundMessage = {
  message_id: number;
  chat: { id: number; type?: string };
  text?: string;
};

export type TelegramUpdate = {
  update_id: number;
  message?: TelegramInboundMessage;
};

/**
 * Long-polling getUpdates (timeout до 50 с по документации Telegram).
 */
export async function fetchTelegramUpdates(offset: number): Promise<TelegramUpdate[]> {
  if (process.env.APP_ENV === "production" && process.env.TELEGRAM_WEBHOOK_SECRET && process.env.TELEGRAM_AGENT_POLLING_ENABLED !== "1") {
    throw new Error("Production Telegram polling is disabled while webhook secret is configured; set TELEGRAM_AGENT_POLLING_ENABLED=1 only for explicit maintenance.");
  }
  const botToken = resolveToken();
  if (!botToken) {
    throw new Error("Нужен TG_BOT_TOKEN или TELEGRAM_BOT_TOKEN для getUpdates");
  }
  const url = buildTelegramUrl("getUpdates");
  const res = await axios.get<{ ok: boolean; result?: TelegramUpdate[] }>(url, {
    params: { offset, timeout: 50, allowed_updates: JSON.stringify(["message"]) },
    timeout: 55_000,
  });
  if (!res.data?.ok) return [];
  return res.data.result ?? [];
}
